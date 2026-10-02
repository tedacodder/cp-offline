"""Sandboxed-ish local execution engine used by the web server.

Design notes
- Subprocesses run in their own session so a timeout kills the whole group.
- stdout/stderr go to temp files under a file-size ulimit, so a runaway
  print loop can never fill RAM or disk; we then read at most OUT_CAP bytes.
- Address-space ulimit guards against memory bombs.
- Temp files/dirs are always removed.
Verdicts: PASS, WRONG ANSWER, COMPILE ERROR, RUNTIME ERROR,
          TIME LIMIT EXCEEDED, UNSUPPORTED, NO EXAMPLES.
Sample tests are never reported as ACCEPTED.
"""

import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from lcparse import parse_example

HERE = Path(__file__).resolve().parent
TIME_LIMIT = 5.0          # seconds per test (same as the original runner)
COMPILE_LIMIT = 30.0
OUT_CAP = 16 * 1024       # bytes of stdout/stderr we keep per test
MAX_CODE_BYTES = 256 * 1024
MAX_STDIN_BYTES = 1024 * 1024
MARK = "\x00CPRESULT\x00"
PRIORITY = ["COMPILE ERROR", "RUNTIME ERROR", "TIME LIMIT EXCEEDED",
            "WRONG ANSWER", "UNSUPPORTED", "PASS"]

_LIMITS = 'ulimit -c 0; ulimit -f 4096; ulimit -v {vm}; exec "$@"'
_CLEAN_ENV = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
              "PYTHONIOENCODING": "utf-8", "LANG": "C.UTF-8"}


def _read_capped(path, cap=OUT_CAP):
    try:
        with open(path, "rb") as f:
            data = f.read(cap + 1)
    except OSError:
        return "", False
    truncated = len(data) > cap
    return data[:cap].decode("utf-8", "replace"), truncated


def run_process(cmd, stdin_text="", timeout=TIME_LIMIT, cwd=None,
                vm_kb=1_048_576):
    """Run cmd; return dict(returncode, stdout, stderr, timed_out, ms, truncated)."""
    tmp = tempfile.mkdtemp(prefix="cp-proc-")
    try:
        in_p, out_p, err_p = (os.path.join(tmp, n) for n in ("in", "out", "err"))
        with open(in_p, "w", encoding="utf-8", errors="replace") as f:
            f.write(stdin_text or "")
        wrapped = ["/bin/sh", "-c", _LIMITS.format(vm=vm_kb), "sh", *cmd]
        start = time.perf_counter()
        timed_out = False
        with open(in_p, "rb") as fin, open(out_p, "wb") as fout, \
                open(err_p, "wb") as ferr:
            proc = subprocess.Popen(
                wrapped, stdin=fin, stdout=fout, stderr=ferr, cwd=cwd,
                env=_CLEAN_ENV, start_new_session=True)
            try:
                proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    proc.kill()
                proc.wait()
        ms = int((time.perf_counter() - start) * 1000)
        out, t1 = _read_capped(out_p)
        err, t2 = _read_capped(err_p)
        return {"returncode": proc.returncode, "stdout": out, "stderr": err,
                "timed_out": timed_out, "ms": ms, "truncated": t1 or t2}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------- comparing
def _tokens(text):
    return text.split()


def _is_float(tok):
    try:
        float(tok)
        return "." in tok or "e" in tok.lower()
    except ValueError:
        return False


def compare_text(actual, expected):
    """Token-wise comparison; floats get a 1e-6 relative/absolute tolerance."""
    a, e = _tokens(actual), _tokens(expected)
    if a == e:
        return True, ""
    if len(a) != len(e):
        return False, ""
    note = False
    for x, y in zip(a, e):
        if x == y:
            continue
        if _is_float(x) and _is_float(y):
            fx, fy = float(x), float(y)
            if abs(fx - fy) <= 1e-6 * max(1.0, abs(fy)):
                note = True
                continue
        return False, ""
    return True, "float tolerance 1e-6 applied" if note else ""


def values_equal(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= 1e-5 * max(1.0, abs(b))
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(values_equal(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(values_equal(a[k], b[k]) for k in a)
    return a == b


def _order_only(a, b):
    try:
        if isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
            key = lambda v: json.dumps(v, sort_keys=True)  # noqa: E731
            return sorted(map(key, a)) == sorted(map(key, b))
    except TypeError:
        pass
    return False


# ---------------------------------------------------------------- compiling
def _compile_cpp(src, exe):
    try:
        r = subprocess.run(
            ["g++", "-std=c++17", "-O2", "-pipe", "-o", str(exe), str(src)],
            capture_output=True, text=True, timeout=COMPILE_LIMIT,
            env=_CLEAN_ENV)
    except subprocess.TimeoutExpired:
        return False, "Compilation timed out"
    except FileNotFoundError:
        return False, "g++ is not installed on this machine"
    return r.returncode == 0, (r.stderr or "")[:OUT_CAP]


class Workspace:
    """Writes code to a temp dir; prepares a command for the language."""

    def __init__(self, language, code):
        self.language, self.code = language, code
        self.dir = Path(tempfile.mkdtemp(prefix="cp-ws-"))
        self.cmd, self.compile_error = None, None

    def prepare(self):
        if self.language == "python":
            src = self.dir / "solution.py"
            src.write_text(self.code, encoding="utf-8")
            self.src = src
            self.cmd = [shutil.which("python3") or sys.executable, "-B", str(src)]
            return True
        src, exe = self.dir / "solution.cpp", self.dir / "solution"
        src.write_text(self.code, encoding="utf-8")
        self.src = src
        ok, msg = _compile_cpp(src, exe)
        if not ok:
            self.compile_error = msg
            return False
        self.cmd = [str(exe)]
        return True

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)


def validate_code(language, code):
    if language not in ("python", "cpp"):
        return "Unsupported language"
    if not isinstance(code, str) or not code.strip():
        return "Code is empty"
    if len(code.encode("utf-8", "replace")) > MAX_CODE_BYTES:
        return "Code is too large (256 KB max)"
    return None


def _finish(result):
    verdicts = [t["verdict"] for t in result["tests"]]
    result["passed"] = sum(1 for v in verdicts if v == "PASS")
    result["total"] = len(verdicts)
    result["verdict"] = next(
        (v for v in PRIORITY if v in verdicts), "NO EXAMPLES")
    result["runtime_ms"] = max((t.get("runtime_ms", 0) for t in result["tests"]),
                               default=0)
    result["label"] = "SAMPLE TEST"
    result["output"] = format_text(result)
    return result


def format_text(r):
    lines = [f"{r['label']} - {r['verdict']}  ({r['passed']}/{r['total']} passed, "
             f"{r['runtime_ms']} ms max)"]
    if r.get("compile_output"):
        lines += ["", "COMPILE OUTPUT", r["compile_output"]]
    for t in r["tests"]:
        lines += ["", f"Example {t['n']}: {t['verdict']} ({t.get('runtime_ms', 0)} ms)"]
        if t["verdict"] == "WRONG ANSWER":
            lines += ["  expected: " + str(t.get("expected", "")),
                      "  got:      " + str(t.get("actual", ""))]
        if t.get("stderr"):
            lines += ["  stderr:", t["stderr"]]
        if t.get("note"):
            lines.append("  note: " + t["note"])
    if r.get("notice"):
        lines += ["", r["notice"]]
    return "\n".join(lines)


# ------------------------------------------------------------- stdin judge
def _judge_stdin(ws, examples, tags):
    tests = []
    for n, ex in enumerate(examples, 1):
        inp, exp = str(ex.get("input", "")), str(ex.get("output", ""))
        r = run_process(ws.cmd, inp)
        t = {"n": n, "input": inp[:4000], "expected": exp[:4000],
             "actual": r["stdout"], "stderr": r["stderr"],
             "runtime_ms": r["ms"]}
        if r["timed_out"]:
            t["verdict"] = "TIME LIMIT EXCEEDED"
        elif r["returncode"] != 0:
            t["verdict"] = "RUNTIME ERROR"
            t["note"] = f"exit code {r['returncode']}"
        else:
            same, note = compare_text(r["stdout"], exp)
            t["verdict"] = "PASS" if same else "WRONG ANSWER"
            if note:
                t["note"] = note
        if r["truncated"]:
            t["note"] = (t.get("note", "") + " output truncated").strip()
        tests.append(t)
    return tests


# --------------------------------------------------------- leetcode judge
def _judge_leetcode(ws, examples):
    tests = []
    harness = str(HERE / "lc_harness.py")
    py = shutil.which("python3") or sys.executable
    for n, ex in enumerate(examples, 1):
        parsed = parse_example(ex.get("example_text", ""))
        if not parsed["ok"]:
            tests.append({"n": n, "verdict": "UNSUPPORTED",
                          "note": parsed["reason"], "input": ex.get("example_text", "")[:500]})
            continue
        payload = json.dumps({"code_path": str(ws.src),
                              "args": [v for _, v in parsed["args"]]})
        r = run_process([py, "-B", harness], payload)
        shown_in = ", ".join(f"{k} = {json.dumps(v)}" for k, v in parsed["args"])
        t = {"n": n, "input": shown_in[:2000],
             "expected": json.dumps(parsed["expected"]) if parsed["expected_ok"]
             else str(parsed["expected"]), "runtime_ms": r["ms"]}
        if r["timed_out"]:
            t["verdict"] = "TIME LIMIT EXCEEDED"
            tests.append(t)
            continue
        out, _, tail = r["stdout"].partition(MARK)
        result = None
        if tail.strip():
            try:
                result = json.loads(tail.strip().splitlines()[0])
            except ValueError:
                result = None
        if result is None:
            t["verdict"] = "RUNTIME ERROR"
            t["stderr"] = (r["stderr"] or "Process exited without a result")[:OUT_CAP]
        elif not result["ok"]:
            t["verdict"] = "RUNTIME ERROR"
            t["stderr"] = result.get("traceback") or result.get("error", "")
        else:
            value = result["value"]
            t["actual"] = json.dumps(value)
            if parsed["expected_ok"]:
                same = values_equal(value, parsed["expected"])
            else:
                same = str(value).strip() == str(parsed["expected"]).strip()
            t["verdict"] = "PASS" if same else "WRONG ANSWER"
            if not same and parsed["expected_ok"] and _order_only(value, parsed["expected"]):
                t["note"] = ("Same elements, different order - LeetCode may accept "
                             "any order for this problem, but this cannot be verified offline.")
        if out.strip():
            t["stdout"] = out[:OUT_CAP]
        tests.append(t)
    return tests


# ------------------------------------------------------------- public API
def judge_examples(problem, language, code):
    """problem: dict with platform, examples (JSON text), tags (list)."""
    err = validate_code(language, code)
    if err:
        return {"verdict": "ERROR", "error": err, "tests": [], "passed": 0,
                "total": 0, "label": "SAMPLE TEST", "output": err, "runtime_ms": 0}
    raw = problem.get("examples") or []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw or "[]")
        except ValueError:
            raw = []
    examples = raw
    if not isinstance(examples, list):
        examples = []
    examples = [e for e in examples if isinstance(e, dict)][:20]

    base = {"tests": [], "label": "SAMPLE TEST", "passed": 0, "total": 0,
            "runtime_ms": 0}
    if not examples:
        base.update(verdict="NO EXAMPLES", output=(
            "This problem has no stored examples, so nothing can be tested "
            "locally. Use Custom Input to run your code by hand."))
        return base
    platform = problem.get("platform")
    tags = [t.lower() for t in problem.get("tags", [])]
    if platform == "codeforces" and "interactive" in tags:
        base.update(verdict="UNSUPPORTED", output=(
            "Interactive problems need an interactor, which is not available "
            "offline. Use Custom Input to test pieces manually."))
        return base
    if platform == "leetcode" and language == "cpp":
        base.update(verdict="UNSUPPORTED", output=(
            "LeetCode problems are function-signature based; there is no stdin "
            "format to feed a C++ program, so automatic example testing is only "
            "available for Python. You can still compile and run C++ with "
            "Custom Input."))
        return base

    ws = Workspace(language, code)
    try:
        if not ws.prepare():
            base.update(verdict="COMPILE ERROR", compile_output=ws.compile_error)
            base["output"] = "COMPILE ERROR\n" + (ws.compile_error or "")
            return base
        tests = (_judge_leetcode(ws, examples) if platform == "leetcode"
                 else _judge_stdin(ws, examples, tags))
    finally:
        ws.close()
    base["tests"] = tests
    res = _finish(base)
    if platform == "codeforces" and res["verdict"] == "WRONG ANSWER":
        res["notice"] = ("Note: many Codeforces problems accept several valid "
                         "answers via a checker; compare 'expected' and 'got' "
                         "yourself before assuming a bug.")
        res["output"] = format_text(res)
    elif res["verdict"] == "PASS":
        res["notice"] = ("These are only the sample examples from the statement. "
                         "Passing them is not an accepted solution.")
        res["output"] = format_text(res)
    return res


def run_custom(language, code, stdin_text):
    err = validate_code(language, code)
    if err:
        return {"verdict": "ERROR", "error": err, "output": err}
    stdin_text = (stdin_text or "")[:MAX_STDIN_BYTES]
    ws = Workspace(language, code)
    try:
        if not ws.prepare():
            return {"verdict": "COMPILE ERROR", "stdout": "",
                    "stderr": ws.compile_error, "runtime_ms": 0,
                    "output": "COMPILE ERROR\n" + (ws.compile_error or "")}
        r = run_process(ws.cmd, stdin_text)
    finally:
        ws.close()
    if r["timed_out"]:
        verdict = "TIME LIMIT EXCEEDED"
    elif r["returncode"] != 0:
        verdict = "RUNTIME ERROR"
    else:
        verdict = "OK"
    text = r["stdout"] + (("\n[stderr]\n" + r["stderr"]) if r["stderr"] else "")
    if r["truncated"]:
        text += "\n[output truncated]"
    return {"verdict": verdict, "stdout": r["stdout"], "stderr": r["stderr"],
            "returncode": r["returncode"], "runtime_ms": r["ms"],
            "truncated": r["truncated"], "output": text or "(no output)"}
