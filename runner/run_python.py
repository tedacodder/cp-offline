#!/usr/bin/env python3

import subprocess
import sys
from pathlib import Path

TIME_LIMIT = 5


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 runner/run_python.py solution.py")
        sys.exit(1)

    source = Path(sys.argv[1]).resolve()

    if not source.exists():
        print(f"Error: file not found: {source}")
        sys.exit(1)

    if source.suffix != ".py":
        print("Error: solution must be a .py file")
        sys.exit(1)

    print("Running...")
    print(f"Time limit: {TIME_LIMIT} seconds")
    print()

    try:
        result = subprocess.run(
            [sys.executable, str(source)],
            capture_output=True,
            text=True,
            timeout=TIME_LIMIT,
        )

    except subprocess.TimeoutExpired:
        print("TIME LIMIT EXCEEDED")
        sys.exit(124)

    print("=" * 60)
    print("PROGRAM OUTPUT")
    print("=" * 60)

    if result.stdout:
        print(result.stdout, end="")

    if result.stderr:
        print()
        print("=" * 60)
        print("STDERR")
        print("=" * 60)
        print(result.stderr, end="")

    print()

    if result.returncode == 0:
        print("STATUS: ACCEPTED (program exited normally)")
    else:
        print(
            f"STATUS: RUNTIME ERROR "
            f"(exit code {result.returncode})"
        )


if __name__ == "__main__":
    main()
