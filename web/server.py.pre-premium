#!/usr/bin/env python3
"""CP Offline server: stdlib ThreadingHTTPServer + SQLite. No dependencies."""

import json
import posixpath
import random
import re
import sys
import threading
import urllib.parse
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import db
from db import DB_PATH, PROJECT_ROOT, clean_tags, get_db, utcnow

sys.path.insert(0, str(PROJECT_ROOT / "runner"))
import engine  # noqa: E402

ROOT = Path(__file__).resolve().parent
HOST, PORT = "127.0.0.1", 8000
MAX_BODY = 1_500_000
RUN_SLOTS = threading.BoundedSemaphore(2)   # keep an old laptop responsive

PLATFORMS = ("codeforces", "leetcode")
TIERS = ("Easy", "Medium", "Hard")
STATUSES = ("not_started", "attempted", "review", "solved")
LANGS = ("python", "cpp")
ID_RE = re.compile(r"^(codeforces|leetcode):[A-Za-z0-9_.\-]{1,64}$")
PAGES = {"/": "index.html"}

TOPICS = {
    "Fundamentals": [
        ("Arrays", ["array"]), ("Strings", ["string", "strings"]),
        ("Implementation", ["implementation", "simulation"]), ("Math", ["math"]),
        ("Sorting", ["sortings", "sorting"]), ("Prefix sums", ["prefix sum"]),
        ("Two pointers", ["two pointers"]), ("Sliding window", ["sliding window"]),
        ("Binary search", ["binary search"]), ("Maps / hashing", ["hash table"]),
        ("Sets", ["ordered set"]), ("Stacks", ["stack", "monotonic stack"]),
        ("Queues", ["queue", "monotonic queue"])],
    "Intermediate": [
        ("Greedy", ["greedy"]), ("Recursion", ["recursion"]),
        ("Backtracking", ["backtracking"]),
        ("Linked lists", ["linked list", "doubly-linked list"]),
        ("Trees", ["tree", "trees", "binary tree", "binary search tree"]),
        ("Heaps", ["heap (priority queue)"]), ("Graphs", ["graph", "graphs"]),
        ("BFS", ["breadth-first search"]),
        ("DFS", ["depth-first search", "dfs and similar"]),
        ("Shortest paths", ["shortest path", "shortest paths"]),
        ("Union find", ["union find", "dsu"]),
        ("Dynamic programming", ["dynamic programming", "dp"]),
        ("Bit manipulation", ["bit manipulation", "bitmasks", "bitmask"])],
    "Advanced": [
        ("Segment trees", ["segment tree"]), ("Fenwick trees", ["binary indexed tree"]),
        ("Topological sorting", ["topological sort"]),
        ("String algorithms", ["string matching", "string suffix structures",
                               "rolling hash", "trie", "hash function"]),
        ("Geometry", ["geometry"]),
        ("Number theory", ["number theory", "chinese remainder theorem"]),
        ("Combinatorics", ["combinatorics"]), ("Flows & matchings", ["flows", "graph matchings"]),
        ("FFT", ["fft"]), ("Game theory", ["games", "game theory"]),
        ("Divide and conquer", ["divide and conquer"]), ("2-SAT", ["2-sat"]),
        ("Meet in the middle", ["meet-in-the-middle"])],
}
# Curriculum entries the dataset has no tag for (shown as "not tagged in dataset").
UNTAGGED = ["Sparse tables", "SCC", "Bridges", "Articulation points", "Advanced DP"]


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message, self.status = message, status


def json_response(h, data, status=200):
    body = json.dumps(data, separators=(",", ":")).encode()
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(body)


def to_int(v, default=None, lo=None, hi=None):
    try:
        n = int(v)
    except (TypeError, ValueError):
        return default
    if lo is not None:
        n = max(lo, n)
    if hi is not None:
        n = min(hi, n)
    return n


def like(s):
    return "%" + s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def check_id(pid):
    if not isinstance(pid, str) or not ID_RE.match(pid):
        raise ApiError("Invalid problem id")
    return pid


def row_problem_list(r):
    d = dict(r)
    d["tags"] = json.loads(d.pop("tags_clean") or "[]")
    return d


LIST_COLS = """p.id, p.platform, p.title, p.tier, p.difficulty, p.rating,
    p.tags_clean, p.has_statement, p.runnable,
    COALESCE(pr.status,'not_started') AS status,
    COALESCE(pr.attempts,0) AS attempts, COALESCE(pr.solved,0) AS was_solved, pr.last_attempted"""
JOIN = "FROM problems p LEFT JOIN progress pr ON pr.problem_id = p.id"


def build_filters(f):
    where, vals = [], []
    s = (f.get("search") or "").strip()[:100]
    if s:
        clauses = ["p.title LIKE ? ESCAPE '\\'", "p.id LIKE ? ESCAPE '\\'",
                   "p.tags_text LIKE ? ESCAPE '\\'"]
        vals += [like(s), like(s), like(s)]
        if s.lower() in PLATFORMS:
            clauses.append("p.platform = ?")
            vals.append(s.lower())
        if s.isdigit():
            clauses.append("p.rating = ?")
            vals.append(int(s))
        where.append("(" + " OR ".join(clauses) + ")")
    plat = f.get("platform")
    if plat:
        if plat not in PLATFORMS:
            raise ApiError("Invalid platform")
        where.append("p.platform = ?")
        vals.append(plat)
    tier = f.get("tier") or f.get("difficulty")
    if tier:
        if tier not in TIERS:
            raise ApiError("Invalid difficulty")
        where.append("p.tier = ?")
        vals.append(tier)
    st = f.get("status")
    if st:
        if st == "unsolved":
            where.append("COALESCE(pr.status,'not_started') IN ('not_started','attempted')")
        elif st == "has_attempts":
            where.append("COALESCE(pr.attempts,0) > 0")
        elif st in STATUSES:
            where.append("COALESCE(pr.status,'not_started') = ?")
            vals.append(st)
        else:
            raise ApiError("Invalid status")
    tags = f.get("tags") or f.get("tag") or []
    if isinstance(tags, str):
        tags = [t for t in tags.split(",") if t]
    tags = [t.strip().lower() for t in tags if isinstance(t, str) and t.strip()][:30]
    if tags:
        where.append("EXISTS (SELECT 1 FROM problem_tags t WHERE t.problem_id = p.id "
                     f"AND t.tag_norm IN ({','.join('?' * len(tags))}))")
        vals += tags
    lo, hi = to_int(f.get("min_rating")), to_int(f.get("max_rating"))
    if lo is not None:
        where.append("p.rating >= ?")
        vals.append(lo)
    if hi is not None:
        where.append("p.rating <= ?")
        vals.append(hi)
    if f.get("has_statement"):
        where.append("p.has_statement = 1")
    if f.get("runnable"):
        where.append("p.runnable = 1")
    return ("WHERE " + " AND ".join(where)) if where else "", vals


SORTS = {
    "id": "p.platform, p.num_key, p.sub_key",
    "rating_asc": "p.rating IS NULL, p.rating, p.num_key",
    "rating_desc": "p.rating IS NULL, p.rating DESC, p.num_key",
    "title": "p.title COLLATE NOCASE",
    "recent": "pr.last_attempted IS NULL, pr.last_attempted DESC",
}


# ------------------------------------------------------------------ queries
def q_problems(conn, params):
    flt = {k: v[0] for k, v in params.items()}
    where, vals = build_filters(flt)
    limit = to_int(flt.get("limit"), 50, 1, 100)
    offset = to_int(flt.get("offset"), 0, 0, 10_000_000)
    order = SORTS.get(flt.get("sort", "id"), SORTS["id"])
    total = conn.execute(f"SELECT COUNT(*) {JOIN} {where}", vals).fetchone()[0]
    rows = conn.execute(
        f"SELECT {LIST_COLS} {JOIN} {where} ORDER BY {order} LIMIT ? OFFSET ?",
        vals + [limit, offset]).fetchall()
    return {"items": [row_problem_list(r) for r in rows], "total": total,
            "limit": limit, "offset": offset}


def q_problem(conn, pid):
    r = conn.execute(
        f"""SELECT p.id, p.platform, p.title, p.difficulty, p.tier, p.rating, p.url,
            p.statement, p.input_format, p.output_format, p.examples, p.tags_clean,
            p.runnable, COALESCE(pr.status,'not_started') AS status,
            COALESCE(pr.attempts,0) AS attempts, pr.language,
            COALESCE(pr.time_spent_seconds,0) AS time_spent_seconds,
            pr.last_attempted, pr.solved_at {JOIN} WHERE p.id = ?""", (pid,)).fetchone()
    if not r:
        raise ApiError("Problem not found", 404)
    d = dict(r)
    d["tags"] = json.loads(d.pop("tags_clean") or "[]")
    try:
        ex = json.loads(d["examples"] or "[]")
        d["examples"] = ex if isinstance(ex, list) else []
    except ValueError:
        d["examples"] = []
    nb = conn.execute("SELECT * FROM problem_notes WHERE problem_id = ?", (pid,)).fetchone()
    d["notes"] = dict(nb) if nb else None
    d["submission_count"] = conn.execute(
        "SELECT COUNT(*) FROM submissions WHERE problem_id = ?", (pid,)).fetchone()[0]
    return d


def active_contest(conn):
    r = conn.execute("SELECT * FROM contests WHERE status='running' ORDER BY id DESC LIMIT 1").fetchone()
    if not r:
        return None
    c = contest_state(conn, r)   # also auto-finishes expired contests
    return {"id": c["id"], "name": c["name"], "remaining_seconds": c["remaining_seconds"]} \
        if c["status"] == "running" else None


def q_stats(conn):
    total = conn.execute("SELECT COUNT(*) FROM problems").fetchone()[0]
    by_status = {s: 0 for s in STATUSES}
    for r in conn.execute("SELECT status, COUNT(*) n FROM progress GROUP BY status"):
        if r["status"] in by_status:
            by_status[r["status"]] = r["n"]
    by_status["not_started"] = total - by_status["attempted"] - by_status["review"] - by_status["solved"]
    att = conn.execute(
        "SELECT COUNT(*) n, COALESCE(SUM(attempts),0) s FROM progress WHERE attempts > 0").fetchone()
    plat = {}
    for p in PLATFORMS:
        t = conn.execute("SELECT COUNT(*) FROM problems WHERE platform=?", (p,)).fetchone()[0]
        s = conn.execute("SELECT COUNT(*) FROM progress pr JOIN problems p ON p.id=pr.problem_id "
                         "WHERE p.platform=? AND pr.status='solved'", (p,)).fetchone()[0]
        plat[p] = {"total": t, "solved": s}
    day = "date(solved_at,'localtime')"
    base = f"SELECT COUNT(*) FROM progress WHERE status='solved' AND solved_at IS NOT NULL AND "
    today = conn.execute(base + f"{day} = date('now','localtime')").fetchone()[0]
    week = conn.execute(base + f"{day} >= date('now','localtime','-6 days')").fetchone()[0]
    month = conn.execute(base + f"{day} >= date('now','localtime','start of month')").fetchone()[0]
    days = {r[0] for r in conn.execute(
        f"SELECT DISTINCT {day} FROM progress WHERE status='solved' AND solved_at IS NOT NULL")}
    streak, cur = 0, datetime.now().date()
    if cur.isoformat() not in days:
        cur -= timedelta(days=1)
    while cur.isoformat() in days:
        streak += 1
        cur -= timedelta(days=1)
    secs = conn.execute("SELECT COALESCE(SUM(seconds),0) FROM time_log "
                        "WHERE day = date('now','localtime')").fetchone()[0]
    sub_today = conn.execute("SELECT COUNT(*) FROM submissions WHERE "
                             "date(created_at,'localtime') = date('now','localtime')").fetchone()[0]
    daily = []
    solved_by = {r[0]: r[1] for r in conn.execute(
        f"SELECT {day}, COUNT(*) FROM progress WHERE status='solved' AND solved_at IS NOT NULL "
        f"AND {day} >= date('now','localtime','-13 days') GROUP BY 1")}
    sub_by = {r[0]: r[1] for r in conn.execute(
        "SELECT date(created_at,'localtime'), COUNT(*) FROM submissions "
        "WHERE date(created_at,'localtime') >= date('now','localtime','-13 days') GROUP BY 1")}
    for i in range(13, -1, -1):
        d = (datetime.now().date() - timedelta(days=i)).isoformat()
        daily.append({"day": d, "solved": solved_by.get(d, 0), "submissions": sub_by.get(d, 0)})

    def mini(where, order, lim=5):
        rows = conn.execute(f"SELECT {LIST_COLS} {JOIN} WHERE {where} ORDER BY {order} LIMIT {lim}").fetchall()
        return [row_problem_list(r) for r in rows]

    return {
        "total": total, "solved": by_status["solved"], "review": by_status["review"],
        "attempted": att["n"], "attempted_status": by_status["attempted"],
        "not_started": by_status["not_started"], "by_status": by_status,
        "total_attempts": att["s"], "platforms": plat,
        "percent_solved": round(100 * by_status["solved"] / total, 2) if total else 0,
        "solved_today": today, "solved_week": week, "solved_month": month,
        "streak": streak, "minutes_today": round(secs / 60),
        "submissions_today": sub_today, "daily": daily,
        "continue": mini("pr.status = 'attempted'", "pr.last_attempted DESC"),
        "review_queue": mini("pr.status = 'review'", "pr.last_attempted DESC"),
        "review_total": by_status["review"],
        "recent_submissions": [dict(r) for r in conn.execute(
            "SELECT s.id, s.problem_id, p.title, s.language, s.result, s.passed, s.total, s.created_at "
            "FROM submissions s JOIN problems p ON p.id = s.problem_id "
            "ORDER BY s.id DESC LIMIT 6")],
        "active_contest": active_contest(conn),
    }


def q_tags(conn, platform):
    if platform and platform not in PLATFORMS:
        raise ApiError("Invalid platform")
    sql = ("SELECT t.tag_norm, MIN(t.tag) tag, COUNT(*) n FROM problem_tags t "
           "JOIN problems p ON p.id = t.problem_id ")
    vals = []
    if platform:
        sql += "WHERE p.platform = ? "
        vals.append(platform)
    sql += "GROUP BY t.tag_norm ORDER BY n DESC"
    return [{"tag": r["tag"], "norm": r["tag_norm"], "count": r["n"]} for r in conn.execute(sql, vals)]


def q_topics(conn):
    counts = {r[0]: r[1] for r in conn.execute("SELECT tag_norm, COUNT(*) FROM problem_tags GROUP BY tag_norm")}
    solved = {r[0]: r[1] for r in conn.execute(
        "SELECT t.tag_norm, COUNT(*) FROM problem_tags t JOIN progress pr ON pr.problem_id = t.problem_id "
        "WHERE pr.status='solved' GROUP BY t.tag_norm")}
    out = []
    for level, topics in TOPICS.items():
        items = []
        for name, tags in topics:
            n_probs = conn.execute(
                f"SELECT COUNT(DISTINCT problem_id) FROM problem_tags WHERE tag_norm IN ({','.join('?' * len(tags))})",
                tags).fetchone()[0]
            if not n_probs:
                continue
            n_solved = conn.execute(
                f"SELECT COUNT(DISTINCT t.problem_id) FROM problem_tags t JOIN progress pr ON pr.problem_id=t.problem_id "
                f"WHERE pr.status='solved' AND t.tag_norm IN ({','.join('?' * len(tags))})", tags).fetchone()[0]
            items.append({"name": name, "tags": tags, "count": n_probs, "solved": n_solved})
        out.append({"level": level, "topics": items})
    return {"levels": out, "untagged": UNTAGGED}


def set_status(conn, pid, status):
    if status not in STATUSES:
        raise ApiError("Invalid status")
    now = utcnow()
    if not conn.execute("SELECT 1 FROM problems WHERE id=?", (pid,)).fetchone():
        raise ApiError("Problem not found", 404)
    solved = 1 if status == "solved" else None
    conn.execute(
        """INSERT INTO progress (problem_id, status, attempts, solved, solved_at, updated_at)
           VALUES (?, ?, 0, ?, ?, ?)
           ON CONFLICT(problem_id) DO UPDATE SET
             status = excluded.status,
             solved = CASE WHEN excluded.status = 'solved' THEN 1
                           WHEN excluded.status = 'review' THEN progress.solved ELSE 0 END,
             solved_at = CASE WHEN excluded.status = 'solved' THEN COALESCE(progress.solved_at, excluded.updated_at)
                              WHEN excluded.status = 'review' THEN progress.solved_at ELSE NULL END,
             updated_at = excluded.updated_at""",
        (pid, status, solved or 0, now if status == "solved" else None, now))
    conn.commit()
    r = conn.execute("SELECT status, attempts, solved_at FROM progress WHERE problem_id=?", (pid,)).fetchone()
    return {"problem_id": pid, **dict(r)}


def record_attempt(conn, pid, language):
    now = utcnow()
    conn.execute(
        """INSERT INTO progress (problem_id, status, attempts, solved, language, last_attempted, updated_at)
           VALUES (?, 'attempted', 1, 0, ?, ?, ?)
           ON CONFLICT(problem_id) DO UPDATE SET
             attempts = attempts + 1, language = excluded.language,
             last_attempted = excluded.last_attempted, updated_at = excluded.updated_at,
             status = CASE WHEN progress.status IN ('solved','review') THEN progress.status ELSE 'attempted' END""",
        (pid, language, now, now))


# ------------------------------------------------------------------ contests
def contest_state(conn, c):
    """Return contest dict with live remaining time; auto-finish expired ones."""
    c = dict(c)
    start = datetime.fromisoformat(c["started_at"])
    end_at = start + timedelta(seconds=c["duration_seconds"])
    now = datetime.now(timezone.utc)
    if c["status"] == "running" and now >= end_at:
        conn.execute("UPDATE contests SET status='finished', ended_at=? WHERE id=?", (end_at.isoformat(), c["id"]))
        conn.commit()
        c["status"], c["ended_at"] = "finished", end_at.isoformat()
    c["remaining_seconds"] = max(0, int((end_at - now).total_seconds())) if c["status"] == "running" else 0
    c["server_now"] = now.isoformat()
    c["params"] = json.loads(c["params"] or "{}")
    probs = conn.execute(
        """SELECT cp.position, cp.problem_id, cp.points, cp.attempts, cp.wrong_attempts, cp.solved_at,
                  p.title, p.platform, p.tier, p.rating
           FROM contest_problems cp JOIN problems p ON p.id = cp.problem_id
           WHERE cp.contest_id = ? ORDER BY cp.position""", (c["id"],)).fetchall()
    c["problems"] = []
    for r in probs:
        d = dict(r)
        d["label"] = chr(65 + d["position"])
        d["solved"] = bool(d["solved_at"])
        if d["solved_at"]:
            d["solve_minutes"] = round((datetime.fromisoformat(d["solved_at"]) - start).total_seconds() / 60, 1)
        c["problems"].append(d)
    c["score"] = sum(p["points"] for p in c["problems"] if p["solved"])
    c["max_score"] = sum(p["points"] for p in c["problems"])
    c["solved_count"] = sum(1 for p in c["problems"] if p["solved"])
    return c


def create_contest(conn, data):
    count = to_int(data.get("count"), 5, 1, 12)
    minutes = to_int(data.get("minutes"), 120, 5, 600)
    plat = data.get("platform") or ""
    if plat and plat not in PLATFORMS:
        raise ApiError("Invalid platform")
    lo, hi = to_int(data.get("min_rating")), to_int(data.get("max_rating"))
    name = (str(data.get("name") or "").strip() or "Offline Contest")[:80]
    flt = {"platform": plat, "status": "unsolved", "has_statement": 1, "runnable": 1,
           "min_rating": lo, "max_rating": hi}
    where, vals = build_filters(flt)
    pool = conn.execute(f"SELECT p.id, p.rating, p.tier FROM problems p LEFT JOIN progress pr "
                        f"ON pr.problem_id = p.id {where}", vals).fetchall()
    if len(pool) < count:
        raise ApiError(f"Only {len(pool)} unsolved problems with testable examples match these settings; "
                       "widen the rating range or lower the number of problems.")
    tier_rank = {"Easy": 0, "Medium": 1, "Hard": 2}

    def difficulty_key(r):
        return r["rating"] if r["rating"] is not None else 800 + 700 * tier_rank.get(r["tier"], 1)
    pool = sorted(pool, key=difficulty_key)
    # Spread picks over the difficulty range: one random pick per equal slice.
    picks, size = [], len(pool) / count
    for i in range(count):
        a, b = int(i * size), max(int((i + 1) * size), int(i * size) + 1)
        picks.append(random.choice(pool[a:b])["id"])
    now = utcnow()
    cur = conn.execute(
        "INSERT INTO contests (name, params, duration_seconds, created_at, started_at, status) "
        "VALUES (?,?,?,?,?, 'running')",
        (name, json.dumps({"count": count, "platform": plat, "min_rating": lo, "max_rating": hi}),
         minutes * 60, now, now))
    cid = cur.lastrowid
    conn.executemany("INSERT INTO contest_problems (contest_id, position, problem_id, points) VALUES (?,?,?,?)",
                     [(cid, i, pid, 100 * (i + 1)) for i, pid in enumerate(picks)])
    conn.commit()
    return cid


# -------------------------------------------------------------------- handler
class Handler(SimpleHTTPRequestHandler):
    server_version = "CPOffline/2"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):
        if args and isinstance(args[0], str) and "/api/" in args[0]:
            return
        super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    # -- guards
    def host_ok(self):
        host = (self.headers.get("Host") or "").split(":")[0]
        return host in ("127.0.0.1", "localhost", "[::1]")

    def read_json(self):
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip()
        if ctype != "application/json":
            raise ApiError("Content-Type must be application/json", 415)
        n = to_int(self.headers.get("Content-Length"), 0, 0)
        if n > MAX_BODY:
            raise ApiError("Request too large", 413)
        try:
            data = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except (ValueError, UnicodeDecodeError):
            raise ApiError("Invalid JSON")
        if not isinstance(data, dict):
            raise ApiError("JSON body must be an object")
        return data

    def dispatch(self, fn):
        if not self.host_ok():
            return json_response(self, {"error": "Forbidden host"}, 403)
        conn = None
        try:
            conn = get_db()
            return json_response(self, fn(conn))
        except ApiError as e:
            return json_response(self, {"error": e.message}, e.status)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"API error: {e!r}\n")
            return json_response(self, {"error": "Internal server error"}, 500)
        finally:
            if conn:
                conn.close()

    # -- GET
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        path, params = u.path, urllib.parse.parse_qs(u.query)
        if path.startswith("/api/"):
            return self.dispatch(lambda c: self.route_get(c, path, params))
        if not self.host_ok():
            return self.send_error(403)
        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        norm = posixpath.normpath(urllib.parse.unquote(path))
        if path in PAGES:
            self.path = "/" + PAGES[path]
        elif norm != urllib.parse.unquote(path).rstrip("/") or not (
                re.fullmatch(r"/static/[A-Za-z0-9_.\-]+\.(css|js|svg|png|ico)", norm)
                or re.fullmatch(r"/[a-z]+\.html", norm)):
            return self.send_error(404)
        return super().do_GET()

    def route_get(self, conn, path, params):
        seg = [urllib.parse.unquote(s) for s in path[len("/api/"):].split("/") if s]
        if seg == ["stats"]:
            return q_stats(conn)
        if seg == ["problems"]:
            return q_problems(conn, params)
        if len(seg) == 2 and seg[0] == "problems":
            return q_problem(conn, check_id(seg[1]))
        if seg == ["tags"]:
            return q_tags(conn, params.get("platform", [""])[0])
        if seg == ["topics"]:
            return q_topics(conn)
        if seg == ["review"]:
            params = {**params, "status": ["review"], "sort": ["recent"], "limit": ["100"]}
            return q_problems(conn, params)
        if len(seg) == 2 and seg[0] == "notes":
            pid = check_id(seg[1])
            r = conn.execute("SELECT * FROM problem_notes WHERE problem_id=?", (pid,)).fetchone()
            return dict(r) if r else {"problem_id": pid}
        if seg == ["submissions"]:
            pid = check_id(params.get("problem_id", [""])[0])
            rows = conn.execute(
                "SELECT id, language, result, passed, total, runtime_ms, created_at, contest_id "
                "FROM submissions WHERE problem_id=? ORDER BY id DESC LIMIT 100", (pid,)).fetchall()
            return {"items": [dict(r) for r in rows]}
        if len(seg) == 2 and seg[0] == "submissions":
            r = conn.execute("SELECT * FROM submissions WHERE id=?", (to_int(seg[1], -1),)).fetchone()
            if not r:
                raise ApiError("Submission not found", 404)
            return dict(r)
        if seg == ["contests", "active"]:
            return {"active": active_contest(conn)}
        if seg == ["contests"]:
            rows = conn.execute("SELECT id FROM contests ORDER BY id DESC LIMIT 50").fetchall()
            out = []
            for r in rows:
                c = contest_state(conn, conn.execute("SELECT * FROM contests WHERE id=?", (r["id"],)).fetchone())
                item = {k: c[k] for k in ("id", "name", "status", "score", "max_score", "solved_count",
                                          "created_at", "duration_seconds", "remaining_seconds")}
                item["problem_count"] = len(c["problems"])
                out.append(item)
            return {"items": out}
        if len(seg) == 2 and seg[0] == "contests":
            r = conn.execute("SELECT * FROM contests WHERE id=?", (to_int(seg[1], -1),)).fetchone()
            if not r:
                raise ApiError("Contest not found", 404)
            return contest_state(conn, r)
        raise ApiError("Not found", 404)

    # -- POST
    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if not path.startswith("/api/"):
            return json_response(self, {"error": "Not found"}, 404)
        self.dispatch(lambda c: self.route_post(c, path))

    def route_post(self, conn, path):
        seg = [urllib.parse.unquote(s) for s in path[len("/api/"):].split("/") if s]
        data = self.read_json()
        if seg == ["progress"]:
            return set_status(conn, check_id(data.get("problem_id")), data.get("status"))
        if seg == ["run"]:
            return self.api_run(conn, data)
        if seg == ["practice"]:
            return self.api_practice(conn, data)
        if len(seg) == 2 and seg[0] == "notes":
            pid = check_id(seg[1])
            if not conn.execute("SELECT 1 FROM problems WHERE id=?", (pid,)).fetchone():
                raise ApiError("Problem not found", 404)
            fields = ("observation", "mistake", "key_idea", "complexity", "need_review")
            vals = []
            for f in fields:
                v = data.get(f, "")
                if not isinstance(v, str):
                    raise ApiError(f"{f} must be text")
                vals.append(v[:10000])
            conn.execute(
                "INSERT INTO problem_notes (problem_id, observation, mistake, key_idea, complexity, need_review, updated_at) "
                "VALUES (?,?,?,?,?,?,?) ON CONFLICT(problem_id) DO UPDATE SET observation=excluded.observation, "
                "mistake=excluded.mistake, key_idea=excluded.key_idea, complexity=excluded.complexity, "
                "need_review=excluded.need_review, updated_at=excluded.updated_at",
                (pid, *vals, utcnow()))
            conn.commit()
            return {"problem_id": pid, "saved": True}
        if seg == ["time"]:
            pid = check_id(data.get("problem_id"))
            secs = to_int(data.get("seconds"), 0, 0, 300)
            if secs and conn.execute("SELECT 1 FROM problems WHERE id=?", (pid,)).fetchone():
                conn.execute(
                    "INSERT INTO time_log (problem_id, day, seconds) VALUES (?, date('now','localtime'), ?) "
                    "ON CONFLICT(problem_id, day) DO UPDATE SET seconds = seconds + excluded.seconds", (pid, secs))
                conn.execute(
                    "INSERT INTO progress (problem_id, status, time_spent_seconds, updated_at) VALUES (?, 'not_started', ?, ?) "
                    "ON CONFLICT(problem_id) DO UPDATE SET time_spent_seconds = COALESCE(time_spent_seconds,0) + excluded.time_spent_seconds",
                    (pid, secs, utcnow()))
                conn.commit()
            return {"ok": True}
        if seg == ["contests"]:
            return {"id": create_contest(conn, data)}
        if len(seg) == 3 and seg[0] == "contests" and seg[2] == "finish":
            cid = to_int(seg[1], -1)
            conn.execute("UPDATE contests SET status='finished', ended_at=? WHERE id=? AND status='running'",
                         (utcnow(), cid))
            conn.commit()
            r = conn.execute("SELECT * FROM contests WHERE id=?", (cid,)).fetchone()
            if not r:
                raise ApiError("Contest not found", 404)
            return contest_state(conn, r)
        raise ApiError("Not found", 404)

    def api_practice(self, conn, data):
        count = to_int(data.get("count"), 3, 1, 10)
        status = data.get("status") or "unsolved"
        if status not in ("unsolved", "review", "any"):
            raise ApiError("Invalid status")
        flt = {"platform": data.get("platform") or "", "tier": data.get("tier") or "",
               "status": "" if status == "any" else status, "tags": data.get("tags") or [],
               "min_rating": data.get("min_rating"), "max_rating": data.get("max_rating"),
               "has_statement": 1}
        where, vals = build_filters(flt)
        total = conn.execute(f"SELECT COUNT(*) {JOIN} {where}", vals).fetchone()[0]
        rows = conn.execute(f"SELECT {LIST_COLS} {JOIN} {where} ORDER BY RANDOM() LIMIT ?",
                            vals + [count]).fetchall()
        return {"items": [row_problem_list(r) for r in rows], "matching": total,
                "minutes": to_int(data.get("minutes"), 0, 0, 600)}

    def api_run(self, conn, data):
        pid = check_id(data.get("problem_id"))
        language, code = data.get("language"), data.get("code", "")
        mode = data.get("mode", "examples")
        if language not in LANGS:
            raise ApiError("Invalid language")
        if mode not in ("examples", "submit", "custom"):
            raise ApiError("Invalid mode")
        err = engine.validate_code(language, code)
        if err:
            raise ApiError(err)
        prob = q_problem(conn, pid)
        contest_id = None
        if mode == "submit" and data.get("contest_id") is not None:
            contest_id = to_int(data.get("contest_id"), -1)
            c = conn.execute("SELECT * FROM contests WHERE id=?", (contest_id,)).fetchone()
            if not c:
                raise ApiError("Contest not found", 404)
            c = contest_state(conn, c)
            if c["status"] != "running":
                raise ApiError("This contest has ended", 409)
            if not any(p["problem_id"] == pid for p in c["problems"]):
                raise ApiError("Problem is not part of this contest")
        if not RUN_SLOTS.acquire(timeout=60):
            raise ApiError("Runner is busy, try again", 503)
        try:
            if mode == "custom":
                result = engine.run_custom(language, code, data.get("stdin", ""))
                result["mode"] = "custom"
                return result
            result = engine.judge_examples(prob, language, code)
        finally:
            RUN_SLOTS.release()
        result["mode"] = mode
        if mode == "submit" and result["verdict"] not in ("ERROR",):
            record_attempt(conn, pid, language)
            cur = conn.execute(
                "INSERT INTO submissions (problem_id, language, code, result, passed, total, runtime_ms, contest_id, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (pid, language, code, result["verdict"], result.get("passed"), result.get("total"),
                 result.get("runtime_ms"), contest_id, utcnow()))
            result["submission_id"] = cur.lastrowid
            if contest_id is not None:
                passed = result["verdict"] == "PASS"
                conn.execute(
                    "UPDATE contest_problems SET attempts = attempts + 1, "
                    "wrong_attempts = wrong_attempts + ?, solved_at = CASE WHEN ? AND solved_at IS NULL THEN ? ELSE solved_at END "
                    "WHERE contest_id=? AND problem_id=?", (0 if passed else 1, passed, utcnow(), contest_id, pid))
            conn.commit()
            result["progress"] = conn.execute(
                "SELECT status, attempts FROM progress WHERE problem_id=?", (pid,)).fetchone()
            result["progress"] = dict(result["progress"])
        return result


def main():
    if not DB_PATH.exists():
        sys.exit(f"Database not found: {DB_PATH}")
    if db.init():
        print("Database migrated to schema v%d" % db.SCHEMA_VERSION)
    print("=" * 60 + f"\nCP Offline\nDatabase: {DB_PATH}\nServer:   http://{HOST}:{PORT}\n" + "=" * 60)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
