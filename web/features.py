"""Premium pack backend: analytics, backup export, random pick, bookmarks.

Additive module: server.py only calls features.get / features.post (two hooks
inserted by apply_premium.py). It creates its own table lazily and never alters
problems / progress / any existing table.
"""

import json
from datetime import datetime, timedelta, timezone

_ready = False


def _ensure(conn):
    global _ready
    if _ready:
        return
    conn.execute("""CREATE TABLE IF NOT EXISTS bookmarks (
        problem_id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
        FOREIGN KEY (problem_id) REFERENCES problems(id))""")
    conn.commit()
    _ready = True


def _longest_streak(days):
    best = cur = 0
    prev = None
    for d in sorted(days):
        dt = datetime.fromisoformat(d).date()
        cur = cur + 1 if prev and (dt - prev).days == 1 else 1
        best = max(best, cur)
        prev = dt
    return best


def analytics(conn):
    today = datetime.now().date()
    start = (today - timedelta(days=181)).isoformat()
    heat = {}
    for d, n in conn.execute(
            "SELECT date(created_at,'localtime') d, COUNT(*) FROM submissions "
            "WHERE date(created_at,'localtime') >= ? GROUP BY d", (start,)):
        heat[d] = heat.get(d, 0) + n
    solved_days = {}
    for d, n in conn.execute(
            "SELECT date(solved_at,'localtime') d, COUNT(*) FROM progress "
            "WHERE status='solved' AND solved_at IS NOT NULL GROUP BY d"):
        solved_days[d] = n
        if d >= start:
            heat[d] = heat.get(d, 0) + n
    heat_list = [{"day": (today - timedelta(days=i)).isoformat(),
                  "count": heat.get((today - timedelta(days=i)).isoformat(), 0)}
                 for i in range(181, -1, -1)]

    totals = {r[0]: r[1] for r in conn.execute(
        "SELECT (rating/200)*200 b, COUNT(*) FROM problems "
        "WHERE platform='codeforces' AND rating IS NOT NULL GROUP BY b")}
    solved_b = {r[0]: r[1] for r in conn.execute(
        "SELECT (p.rating/200)*200 b, COUNT(*) FROM problems p JOIN progress pr ON pr.problem_id=p.id "
        "WHERE p.platform='codeforces' AND p.rating IS NOT NULL AND pr.status='solved' GROUP BY b")}
    rating = [{"from": b, "to": b + 199, "total": totals[b], "solved": solved_b.get(b, 0)}
              for b in sorted(totals) if b >= 800]

    tiers = []
    for t in ("Easy", "Medium", "Hard"):
        tot = conn.execute("SELECT COUNT(*) FROM problems WHERE platform='leetcode' AND tier=?", (t,)).fetchone()[0]
        sol = conn.execute("SELECT COUNT(*) FROM problems p JOIN progress pr ON pr.problem_id=p.id "
                           "WHERE p.platform='leetcode' AND p.tier=? AND pr.status='solved'", (t,)).fetchone()[0]
        tiers.append({"tier": t, "total": tot, "solved": sol})

    tags = [dict(r) for r in conn.execute(
        """SELECT MIN(t.tag) tag, COUNT(*) attempted,
                  SUM(CASE WHEN pr.status='solved' THEN 1 ELSE 0 END) solved,
                  SUM(pr.attempts) attempts
           FROM problem_tags t JOIN progress pr ON pr.problem_id=t.problem_id
           WHERE pr.attempts > 0 GROUP BY t.tag_norm ORDER BY attempted DESC, attempts DESC LIMIT 12""")]

    verdicts = [dict(r) for r in conn.execute(
        "SELECT result, COUNT(*) n FROM submissions GROUP BY result ORDER BY n DESC")]
    langs = [dict(r) for r in conn.execute(
        "SELECT language, COUNT(*) n FROM submissions GROUP BY language ORDER BY n DESC")]

    weeks = []
    for w in range(11, -1, -1):
        a = today - timedelta(days=today.weekday() + 7 * w)
        n = sum(solved_days.get((a + timedelta(days=i)).isoformat(), 0) for i in range(7))
        weeks.append({"week": a.isoformat(), "solved": n})

    solved_total = conn.execute("SELECT COUNT(*) FROM progress WHERE status='solved'").fetchone()[0]
    first_try = conn.execute("SELECT COUNT(*) FROM progress WHERE status='solved' AND attempts <= 1").fetchone()[0]
    sub_total = conn.execute("SELECT COUNT(*) FROM submissions").fetchone()[0]
    secs = conn.execute("SELECT COALESCE(SUM(seconds),0) FROM time_log").fetchone()[0]
    avg = conn.execute("SELECT AVG(attempts) FROM progress WHERE status='solved' AND attempts > 0").fetchone()[0]
    contests = conn.execute("SELECT COUNT(*) FROM contests WHERE status='finished'").fetchone()[0]
    return {
        "heat": heat_list, "rating": rating, "tiers": tiers, "tags": tags, "verdicts": verdicts,
        "languages": langs, "weeks": weeks,
        "summary": {
            "solved": solved_total, "submissions": sub_total, "hours": round(secs / 3600, 1),
            "longest_streak": _longest_streak(solved_days.keys()),
            "first_try_rate": round(100 * first_try / solved_total) if solved_total else None,
            "avg_attempts": round(avg, 1) if avg else None, "contests": contests,
            "active_days": sum(1 for h in heat_list if h["count"]),
        },
    }


def export_all(conn):
    def rows(sql):
        return [dict(r) for r in conn.execute(sql)]
    return {
        "app": "cp-offline", "format": 1, "exported_at": datetime.now(timezone.utc).isoformat(),
        "progress": rows("SELECT * FROM progress"), "notes": rows("SELECT * FROM problem_notes"),
        "submissions": rows("SELECT * FROM submissions"), "contests": rows("SELECT * FROM contests"),
        "contest_problems": rows("SELECT * FROM contest_problems"), "time_log": rows("SELECT * FROM time_log"),
        "bookmarks": rows("SELECT * FROM bookmarks"),
    }


def get(conn, seg, params, ctx):
    """Return a dict for handled routes, else None."""
    if seg == ["analytics"]:
        _ensure(conn)
        return analytics(conn)
    if seg == ["export"]:
        _ensure(conn)
        return export_all(conn)
    if seg == ["random"]:
        flt = {k: v[0] for k, v in params.items()}
        flt.setdefault("status", "unsolved")
        if flt["status"] == "any":
            flt["status"] = ""
        flt["has_statement"] = 1
        where, vals = ctx.build_filters(flt)
        r = conn.execute(f"SELECT p.id {ctx.JOIN} {where} ORDER BY RANDOM() LIMIT 1", vals).fetchone()
        if not r:
            raise ctx.ApiError("No problem matches these filters", 404)
        return {"id": r["id"]}
    if seg == ["bookmarks"]:
        _ensure(conn)
        rows = conn.execute(
            f"SELECT {ctx.LIST_COLS} FROM bookmarks b JOIN problems p ON p.id=b.problem_id "
            "LEFT JOIN progress pr ON pr.problem_id=p.id ORDER BY b.created_at DESC LIMIT 300").fetchall()
        items = [ctx.row_problem_list(r) for r in rows]
        return {"ids": [i["id"] for i in items], "items": items}
    return None


def post(conn, seg, data, ctx):
    if seg == ["bookmarks"]:
        _ensure(conn)
        pid = ctx.check_id(data.get("problem_id"))
        if not conn.execute("SELECT 1 FROM problems WHERE id=?", (pid,)).fetchone():
            raise ctx.ApiError("Problem not found", 404)
        if data.get("on", True):
            conn.execute("INSERT OR IGNORE INTO bookmarks (problem_id, created_at) VALUES (?,?)",
                         (pid, datetime.now(timezone.utc).isoformat()))
        else:
            conn.execute("DELETE FROM bookmarks WHERE problem_id=?", (pid,))
        conn.commit()
        return {"problem_id": pid, "on": bool(data.get("on", True))}
    return None
