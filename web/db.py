"""SQLite access + safe, idempotent migrations for CP Offline.

Never drops or deletes problems/progress. Only ADD COLUMN, CREATE TABLE IF NOT
EXISTS, CREATE INDEX IF NOT EXISTS and derived-column backfills.
"""

import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
DB_PATH = PROJECT_ROOT / "data" / "cp_offline.db"
sys.path.insert(0, str(PROJECT_ROOT / "runner"))

from lcparse import is_runnable  # noqa: E402

SCHEMA_VERSION = 2


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def get_db(path=None):
    conn = sqlite3.connect(path or DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 8000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _cols(conn, table):
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


def _add_col(conn, table, name, decl):
    if name not in _cols(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")


def clean_tags(raw):
    """Real tags only: CF stores placeholder empty strings for missing tags."""
    try:
        data = json.loads(raw or "[]")
    except ValueError:
        return []
    seen, out = set(), []
    for t in data if isinstance(data, list) else []:
        if isinstance(t, str) and t.strip() and t.strip().lower() not in seen:
            seen.add(t.strip().lower())
            out.append(t.strip())
    return out


def derive_tier(platform, difficulty, rating):
    if difficulty:
        return difficulty
    if rating is None:
        return None
    return "Easy" if rating <= 1200 else ("Medium" if rating <= 1900 else "Hard")


def split_id(pid):
    """'codeforces:1213D1' -> (1213, 'D1'); 'leetcode:42' -> (42, '')."""
    ident = pid.split(":", 1)[1] if ":" in pid else pid
    m = re.match(r"^(\d+)(.*)$", ident)
    return (int(m.group(1)), m.group(2)) if m else (0, ident)


def _has_examples(platform, examples):
    try:
        data = json.loads(examples or "[]")
    except ValueError:
        return 0
    return 1 if isinstance(data, list) and len(data) > 0 else 0


def migrate(conn):
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    if version >= SCHEMA_VERSION:
        return False

    for name, decl in (("num_key", "INTEGER"), ("sub_key", "TEXT"),
                       ("tier", "TEXT"), ("tags_clean", "TEXT"),
                       ("tags_text", "TEXT"), ("has_statement", "INTEGER"),
                       ("has_examples", "INTEGER"), ("runnable", "INTEGER")):
        _add_col(conn, "problems", name, decl)
    for name, decl in (("solved_at", "TEXT"), ("updated_at", "TEXT")):
        _add_col(conn, "progress", name, decl)

    conn.executescript("""
    CREATE TABLE IF NOT EXISTS problem_tags (
        problem_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        tag_norm TEXT NOT NULL,
        PRIMARY KEY (problem_id, tag_norm),
        FOREIGN KEY (problem_id) REFERENCES problems(id)
    );
    CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        problem_id TEXT NOT NULL,
        language TEXT NOT NULL,
        code TEXT NOT NULL,
        result TEXT NOT NULL,
        passed INTEGER,
        total INTEGER,
        runtime_ms INTEGER,
        contest_id INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (problem_id) REFERENCES problems(id)
    );
    CREATE TABLE IF NOT EXISTS problem_notes (
        problem_id TEXT PRIMARY KEY,
        observation TEXT DEFAULT '',
        mistake TEXT DEFAULT '',
        key_idea TEXT DEFAULT '',
        complexity TEXT DEFAULT '',
        need_review TEXT DEFAULT '',
        updated_at TEXT,
        FOREIGN KEY (problem_id) REFERENCES problems(id)
    );
    CREATE TABLE IF NOT EXISTS time_log (
        problem_id TEXT NOT NULL,
        day TEXT NOT NULL,
        seconds INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (problem_id, day),
        FOREIGN KEY (problem_id) REFERENCES problems(id)
    );
    CREATE TABLE IF NOT EXISTS contests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        params TEXT,
        duration_seconds INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        ended_at TEXT,
        status TEXT NOT NULL DEFAULT 'running'
    );
    CREATE TABLE IF NOT EXISTS contest_problems (
        contest_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        problem_id TEXT NOT NULL,
        points INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        wrong_attempts INTEGER NOT NULL DEFAULT 0,
        solved_at TEXT,
        PRIMARY KEY (contest_id, position),
        FOREIGN KEY (contest_id) REFERENCES contests(id),
        FOREIGN KEY (problem_id) REFERENCES problems(id)
    );
    """)

    # Backfill derived columns (only rows not yet processed).
    rows = conn.execute(
        "SELECT id, platform, difficulty, rating, statement, examples, tags "
        "FROM problems WHERE num_key IS NULL").fetchall()
    for r in rows:
        tags = clean_tags(r["tags"])
        num, sub = split_id(r["id"])
        runnable = 0
        if r["platform"] == "leetcode":
            runnable = 1 if is_runnable(r["examples"]) else 0
        else:
            runnable = _has_examples(r["platform"], r["examples"])
        conn.execute(
            "UPDATE problems SET num_key=?, sub_key=?, tier=?, tags_clean=?, "
            "tags_text=?, has_statement=?, has_examples=?, runnable=? WHERE id=?",
            (num, sub, derive_tier(r["platform"], r["difficulty"], r["rating"]),
             json.dumps(tags), "|" + "|".join(t.lower() for t in tags) + "|",
             1 if (r["statement"] or "").strip() else 0,
             _has_examples(r["platform"], r["examples"]), runnable, r["id"]))
        conn.executemany(
            "INSERT OR IGNORE INTO problem_tags (problem_id, tag, tag_norm) "
            "VALUES (?,?,?)", [(r["id"], t, t.lower()) for t in tags])

    # Existing solved rows predate solved_at: best available timestamp is
    # last_attempted (the moment the user last worked on it).
    conn.execute(
        "UPDATE progress SET solved_at = last_attempted "
        "WHERE status = 'solved' AND solved_at IS NULL AND last_attempted IS NOT NULL")

    conn.executescript("""
    CREATE INDEX IF NOT EXISTS idx_problems_order ON problems(platform, num_key, sub_key);
    CREATE INDEX IF NOT EXISTS idx_problems_tier ON problems(tier);
    CREATE INDEX IF NOT EXISTS idx_problems_pick ON problems(platform, has_statement, runnable);
    CREATE INDEX IF NOT EXISTS idx_tags_norm ON problem_tags(tag_norm, problem_id);
    CREATE INDEX IF NOT EXISTS idx_progress_last ON progress(last_attempted);
    CREATE INDEX IF NOT EXISTS idx_progress_solved_at ON progress(solved_at);
    CREATE INDEX IF NOT EXISTS idx_submissions_problem ON submissions(problem_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_contest_problems_pid ON contest_problems(problem_id);
    """)
    conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
    conn.commit()
    return True


def init(path=None):
    conn = get_db(path)
    try:
        changed = migrate(conn)
        if changed:
            conn.execute("ANALYZE")
            conn.commit()
    finally:
        conn.close()
    return changed


if __name__ == "__main__":
    print("migrated" if init() else "already up to date")
