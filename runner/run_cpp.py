#!/usr/bin/env python3

import os
import subprocess
import sys
import tempfile
from pathlib import Path

TIME_LIMIT = 5


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 runner/run_cpp.py solution.cpp")
        sys.exit(1)

    source = Path(sys.argv[1]).resolve()

    if not source.exists():
        print(f"Error: file not found: {source}")
        sys.exit(1)

    if source.suffix != ".cpp":
        print("Error: solution must be a .cpp file")
        sys.exit(1)

    with tempfile.TemporaryDirectory(prefix="cp-run-") as temp:
        temp = Path(temp)
        executable = temp / "solution"

        print("Compiling...")

        compile_result = subprocess.run(
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

        if compile_result.returncode != 0:
            print()
            print("COMPILE ERROR")
            print("=" * 60)
            print(compile_result.stderr)
            sys.exit(1)

        print("Compilation successful.")
        print()

        print("Running...")
        print(f"Time limit: {TIME_LIMIT} seconds")
        print()

        try:
            result = subprocess.run(
                [str(executable)],
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
            print(f"STATUS: RUNTIME ERROR (exit code {result.returncode})")


if __name__ == "__main__":
    main()
