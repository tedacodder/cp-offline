"""Parse LeetCode example text ("Input: a = 1, b = [2,3]\nOutput: 5") into
structured arguments and an expected value. Pure stdlib, no side effects."""

import ast
import json
import re

_NAME_EQ = re.compile(r"[A-Za-z_]\w*\s*=")


def parse_value(text):
    """Return (ok, value). Accepts JSON, Python literals, true/false/null."""
    s = text.strip().rstrip(",").strip()
    if not s:
        return False, None
    try:
        return True, json.loads(s)
    except ValueError:
        pass
    try:
        fixed = re.sub(r"\btrue\b", "True", s)
        fixed = re.sub(r"\bfalse\b", "False", fixed)
        fixed = re.sub(r"\bnull\b", "None", fixed)
        return True, ast.literal_eval(fixed)
    except (ValueError, SyntaxError):
        return False, None


def _split_top_level(segment):
    """Split 'a = 1, b = [1,2]' at commas that start a new 'name =' pair."""
    parts, depth, quote, start, i = [], 0, None, 0, 0
    while i < len(segment):
        ch = segment[i]
        if quote:
            if ch == "\\":
                i += 1
            elif ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch in "[({":
            depth += 1
        elif ch in "])}":
            depth -= 1
        elif ch == "," and depth == 0:
            if _NAME_EQ.match(segment[i + 1:].lstrip()):
                parts.append(segment[start:i])
                start = i + 1
        i += 1
    parts.append(segment[start:])
    return [p.strip() for p in parts if p.strip()]


def parse_example(text):
    """Return dict(ok, args=[(name, value)], expected, expected_ok, reason)."""
    out = {"ok": False, "args": [], "expected": None,
           "expected_ok": False, "reason": ""}
    if not text or "Input:" not in text or "Output:" not in text:
        out["reason"] = "Example is not in 'Input: ... Output: ...' form"
        return out
    after_in = text.split("Input:", 1)[1]
    in_seg, out_seg = after_in.split("Output:", 1)
    out_seg = re.split(r"\n\s*Explanation", out_seg, maxsplit=1)[0]
    pairs = _split_top_level(in_seg.strip())
    if not pairs:
        out["reason"] = "No arguments found"
        return out
    for pair in pairs:
        m = re.match(r"([A-Za-z_]\w*)\s*=\s*(.*)$", pair, re.S)
        if not m:
            out["reason"] = f"Cannot parse argument: {pair[:40]}"
            return out
        ok, val = parse_value(m.group(2))
        if not ok:
            out["reason"] = f"Cannot parse value of {m.group(1)}"
            return out
        out["args"].append((m.group(1), val))
    ok, val = parse_value(out_seg.strip().splitlines()[0] if out_seg.strip() else "")
    out["expected_ok"] = ok
    out["expected"] = val if ok else out_seg.strip()
    out["ok"] = True
    return out


def is_runnable(examples_json):
    """True if at least one example can drive the Python function harness."""
    try:
        examples = json.loads(examples_json or "[]")
    except ValueError:
        return False
    if not isinstance(examples, list):
        return False
    return any(
        isinstance(e, dict) and parse_example(e.get("example_text", ""))["ok"]
        for e in examples
    )
