#!/usr/bin/env python3

import json
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path


DB = Path("data/cp_offline.db")
TIME_LIMIT = 5


def normalize_output(text):
    """
    Normalize whitespace so harmless formatting differences
    don't cause a failed example.
    """
    return " ".join(text.split())


def get_problem(problem_id):
    conn = sqlite3.connect(DB)

    row = conn.execute(
        """
        SELECT id, platform, title, examples
        FROM problems
        WHERE id = ?
        """,
        (problem_id,),
    ).fetchone()

    conn.close()

    return row


def compile_cpp(source, executable):
    return subprocess.run(
        [
            "g++",
            "-std=c++17",
            "-O2",
            "-pipe",
            "-o",
            str(executable),
            str(source),
        ],
        capture_output=True,
        text=True,
    )


def run_program(command, input_data):
    try:
        result = subprocess.run(
            command,
            input=input_data,
            capture_output=True,
            text=True,
            timeout=TIME_LIMIT,
        )

        return result, None

    except subprocess.TimeoutExpired:
        return None, "TIME_LIMIT"


def main():
    if len(sys.argv) != 3:
        print(
            "Usage: python3 runner/test_examples.py "
            "PROBLEM_ID SOLUTION"
        )
        print()
        print("Example:")
        print(
            "python3 runner/test_examples.py "
            "codeforces:852A solution.cpp"
        )
        sys.exit(1)

    problem_id = sys.argv[1]
    solution = Path(sys.argv[2]).resolve()

    if not solution.exists():
        print(f"Error: solution not found: {solution}")
        sys.exit(1)

    row = get_problem(problem_id)

    if not row:
        print(f"Error: problem not found: {problem_id}")
        sys.exit(1)

    _, platform, title, examples_text = row

    print(f"Problem: {problem_id}")
    print(f"Title:   {title}")
    print(f"Platform: {platform}")
    print()

    if not examples_text:
        print("This problem has no stored examples.")
        sys.exit(1)

    try:
        examples = json.loads(examples_text)
    except json.JSONDecodeError as e:
        print(f"Invalid examples JSON: {e}")
        sys.exit(1)

    if not isinstance(examples, list) or not examples:
        print("No usable examples found.")
        sys.exit(1)

    print(f"Examples found: {len(examples)}")
    print()

    with tempfile.TemporaryDirectory(prefix="cp-example-") as temp:
        temp = Path(temp)

        if solution.suffix == ".cpp":
            executable = temp / "solution"

            print("Compiling C++17 solution...")

            compile_result = compile_cpp(
                solution,
                executable,
            )

            if compile_result.returncode != 0:
                print()
                print("COMPILE ERROR")
                print("=" * 60)
                print(compile_result.stderr)
                sys.exit(1)

            command = [str(executable)]

        elif solution.suffix == ".py":
            print("Using Python 3 solution...")
            command = [sys.executable, str(solution)]

        else:
            print("Error: only .cpp and .py are supported.")
            sys.exit(1)

        passed = 0
        failed = 0
        final_status = "PASS"

        for number, example in enumerate(examples, start=1):
            input_data = example.get("input", "")
            expected = example.get("output", "")

            print("=" * 60)
            print(f"EXAMPLE {number}")
            print("=" * 60)

            result, error = run_program(
                command,
                input_data,
            )

            if error == "TIME_LIMIT":
                print("Result: TIME LIMIT EXCEEDED")
                failed += 1
                final_status = "TIME LIMIT EXCEEDED"
                continue

            if result.returncode != 0:
                print("Result: RUNTIME ERROR")
                print()
                print(result.stderr)
                failed += 1
                if final_status == "PASS":
                    final_status = "RUNTIME ERROR"
                continue

            actual = result.stdout

            if normalize_output(actual) == normalize_output(expected):
                print("Result: PASS")
                passed += 1
            else:
                print("Result: FAIL")
                failed += 1
                if final_status == "PASS":
                    final_status = "WRONG ANSWER"

                print()
                print("Expected:")
                print(expected)

                print("Got:")
                print(actual)

        print()
        print("=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")

        print(f"STATUS: {final_status}")

        if final_status == "PASS":
            sys.exit(0)
        else:
            sys.exit(1)


if __name__ == "__main__":
    main()
