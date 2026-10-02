#!/usr/bin/env python3

import sqlite3
import sys
from pathlib import Path


DB = Path("data/cp_offline.db")

VALID_STATUSES = {
    "not_started",
    "attempted",
    "solved",
    "review",
}


def get_problem(problem_id):
    conn = sqlite3.connect(DB)

    row = conn.execute(
        """
        SELECT id, platform, title, difficulty, rating
        FROM problems
        WHERE id = ?
        """,
        (problem_id,),
    ).fetchone()

    conn.close()

    return row


def update_status(problem_id, status, solved):
    conn = sqlite3.connect(DB)

    conn.execute(
        """
        INSERT INTO progress (
            problem_id,
            status,
            attempts,
            solved
        )
        VALUES (?, ?, 0, ?)

        ON CONFLICT(problem_id)
        DO UPDATE SET
            status = excluded.status,
            solved = excluded.solved
        """,
        (problem_id, status, solved),
    )

    # Keep the web dashboard's "solved today / streak" accurate (column added by web/db.py).
    cols = {r[1] for r in conn.execute("PRAGMA table_info(progress)")}
    if "solved_at" in cols:
        conn.execute(
            "UPDATE progress SET solved_at = CASE WHEN ? = 'solved' "
            "THEN COALESCE(solved_at, strftime('%Y-%m-%dT%H:%M:%f+00:00','now')) "
            "WHEN ? = 'review' THEN solved_at ELSE NULL END WHERE problem_id = ?",
            (status, status, problem_id),
        )

    conn.commit()
    conn.close()


def show_problem(problem_id):
    conn = sqlite3.connect(DB)

    row = conn.execute(
        """
        SELECT
            p.id,
            p.platform,
            p.title,
            p.difficulty,
            p.rating,
            COALESCE(pr.status, 'not_started'),
            COALESCE(pr.attempts, 0),
            COALESCE(pr.solved, 0),
            COALESCE(pr.language, '-'),
            COALESCE(pr.time_spent_seconds, 0),
            COALESCE(pr.notes, ''),
            COALESCE(pr.last_attempted, '-')
        FROM problems p
        LEFT JOIN progress pr
            ON p.id = pr.problem_id
        WHERE p.id = ?
        """,
        (problem_id,),
    ).fetchone()

    conn.close()

    if not row:
        print(f"Problem not found: {problem_id}")
        return 1

    (
        problem_id,
        platform,
        title,
        difficulty,
        rating,
        status,
        attempts,
        solved,
        language,
        time_spent,
        notes,
        last_attempted,
    ) = row

    print("=" * 60)
    print("PROBLEM PROGRESS")
    print("=" * 60)
    print(f"ID:          {problem_id}")
    print(f"Platform:    {platform}")
    print(f"Title:       {title}")
    print(f"Difficulty:  {difficulty or '-'}")
    print(f"Rating:      {rating or '-'}")
    print(f"Status:      {status}")
    print(f"Attempts:    {attempts}")
    print(f"Solved:      {'yes' if solved else 'no'}")
    print(f"Language:    {language}")
    print(f"Time spent:  {time_spent}s")
    print(f"Last attempt:{last_attempted}")

    if notes:
        print(f"Notes:       {notes}")

    return 0


def list_progress():
    conn = sqlite3.connect(DB)

    rows = conn.execute(
        """
        SELECT
            p.id,
            p.title,
            p.platform,
            COALESCE(pr.status, 'not_started'),
            COALESCE(pr.attempts, 0),
            COALESCE(pr.solved, 0)
        FROM problems p
        LEFT JOIN progress pr
            ON p.id = pr.problem_id
        WHERE pr.problem_id IS NOT NULL
        ORDER BY pr.last_attempted DESC
        """
    ).fetchall()

    conn.close()

    if not rows:
        print("No progress records yet.")
        return

    print("=" * 80)
    print("PROGRESS")
    print("=" * 80)

    for problem_id, title, platform, status, attempts, solved in rows:
        print(
            f"{problem_id:<22} "
            f"{status:<12} "
            f"attempts={attempts:<3} "
            f"solved={'yes' if solved else 'no'} "
            f"| {title}"
        )


def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 runner/progress.py show PROBLEM_ID")
        print("  python3 runner/progress.py mark-solved PROBLEM_ID")
        print("  python3 runner/progress.py mark-review PROBLEM_ID")
        print("  python3 runner/progress.py mark-attempted PROBLEM_ID")
        print("  python3 runner/progress.py list")
        sys.exit(1)

    command = sys.argv[1]

    if command == "list":
        sys.exit(list_progress())

    if len(sys.argv) != 3:
        print(f"Usage: python3 runner/progress.py {command} PROBLEM_ID")
        sys.exit(1)

    problem_id = sys.argv[2]

    if not get_problem(problem_id):
        print(f"Problem not found: {problem_id}")
        sys.exit(1)

    if command == "show":
        sys.exit(show_problem(problem_id))

    status_map = {
        "mark-solved": ("solved", 1),
        "mark-review": ("review", 1),
        "mark-attempted": ("attempted", 0),
    }

    if command not in status_map:
        print(f"Unknown command: {command}")
        sys.exit(1)

    status, solved = status_map[command]

    update_status(problem_id, status, solved)

    print(f"Updated: {problem_id}")
    print(f"Status:  {status}")
    print(f"Solved:  {'yes' if solved else 'no'}")


if __name__ == "__main__":
    main()
