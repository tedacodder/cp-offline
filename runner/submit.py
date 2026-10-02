#!/usr/bin/env python3

import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


DB = Path("data/cp_offline.db")
TESTER = Path("runner/test_examples.py")


def get_language(solution):
    suffix = solution.suffix.lower()

    if suffix == ".py":
        return "python"

    if suffix == ".cpp":
        return "cpp"

    return None


def record_attempt(problem_id, language):
    conn = sqlite3.connect(DB)

    now = datetime.now(timezone.utc).isoformat()

    conn.execute(
        """
        INSERT INTO progress (
            problem_id,
            status,
            attempts,
            solved,
            language,
            last_attempted
        )
        VALUES (?, 'attempted', 1, 0, ?, ?)

        ON CONFLICT(problem_id)
        DO UPDATE SET
            status = 'attempted',
            attempts = attempts + 1,
            language = excluded.language,
            last_attempted = excluded.last_attempted
        """,
        (problem_id, language, now),
    )

    conn.commit()
    conn.close()


def extract_status(output):
    for line in reversed(output.splitlines()):
        line = line.strip()

        if line.startswith("STATUS:"):
            return line.replace("STATUS:", "", 1).strip()

    return "UNKNOWN"


def main():
    if len(sys.argv) != 3:
        print(
            "Usage: python3 runner/submit.py "
            "PROBLEM_ID SOLUTION"
        )
        sys.exit(1)

    problem_id = sys.argv[1]
    solution = Path(sys.argv[2]).resolve()

    if not solution.exists():
        print(f"Error: solution not found: {solution}")
        sys.exit(1)

    language = get_language(solution)

    if not language:
        print("Error: only .py and .cpp solutions are supported.")
        sys.exit(1)

    if not TESTER.exists():
        print(f"Error: tester not found: {TESTER}")
        sys.exit(1)

    result = subprocess.run(
        [
            sys.executable,
            str(TESTER),
            problem_id,
            str(solution),
        ],
        capture_output=True,
        text=True,
    )

    print(result.stdout, end="")

    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)

    status = extract_status(result.stdout)

    record_attempt(problem_id, language)

    print()
    print("=" * 60)
    print("SUBMISSION RECORDED")
    print("=" * 60)
    print(f"Problem:  {problem_id}")
    print(f"Language: {language}")
    print(f"Result:   {status}")
    print("Progress: attempted")
    print("Solved:   no")

    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
