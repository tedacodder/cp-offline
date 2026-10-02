#!/usr/bin/env python3
"""Executes one LeetCode-style call inside its own subprocess.

stdin  : JSON {"code_path": str, "args": [...], "method": str|None}
stdout : user prints, followed by a marker line holding the JSON result.
"""

import contextlib
import inspect
import io
import json
import sys
import traceback
from typing import *  # noqa: F401,F403  (LeetCode templates assume this)
import collections, heapq, bisect, math, itertools, functools, re, string  # noqa

MARK = "\x00CPRESULT\x00"


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def to_list_node(values):
    head = tail = None
    for v in values or []:
        node = ListNode(v)
        if head is None:
            head = tail = node
        else:
            tail.next = node
            tail = node
    return head


def from_list_node(node):
    out, seen = [], 0
    while node is not None and seen < 1_000_000:
        out.append(node.val)
        node = node.next
        seen += 1
    return out


def to_tree(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue, i = collections.deque([root]), 1
    while queue and i < len(values):
        node = queue.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root


def from_tree(root):
    if root is None:
        return []
    out, queue = [], collections.deque([root])
    while queue:
        node = queue.popleft()
        if node is None:
            out.append(None)
        else:
            out.append(node.val)
            queue.append(node.left)
            queue.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out


def kind_of(annotation):
    text = str(annotation)
    if "ListNode" in text:
        return "list"
    if "TreeNode" in text:
        return "tree"
    return None


def main():
    payload = json.load(sys.stdin)
    real_stdout = sys.stdout
    buf = io.StringIO()
    result = {"ok": False}
    try:
        with open(payload["code_path"], encoding="utf-8") as f:
            source = f.read()
        env = {"__name__": "solution", "ListNode": ListNode,
               "TreeNode": TreeNode}
        env.update({k: v for k, v in globals().items() if k in (
            "List", "Optional", "Dict", "Set", "Tuple", "Deque", "Any")})
        with contextlib.redirect_stdout(buf):
            exec(compile(source, "solution.py", "exec"), env)
            cls = env.get("Solution")
            if cls is None:
                raise RuntimeError("No `class Solution` found in your code")
            name = payload.get("method")
            if not name:
                names = [n for n, v in cls.__dict__.items()
                         if callable(v) and not n.startswith("_")]
                if not names:
                    raise RuntimeError("`Solution` has no public method")
                name = names[0]
            method = getattr(cls(), name)
            params = list(inspect.signature(method).parameters.values())
            args = list(payload["args"])
            for idx, param in enumerate(params[:len(args)]):
                k = kind_of(param.annotation)
                if k == "list":
                    args[idx] = to_list_node(args[idx])
                elif k == "tree":
                    args[idx] = to_tree(args[idx])
            ret_annotation = inspect.signature(method).return_annotation
            value = method(*args)
            if value is None and ret_annotation in (None, "None") and args:
                value = args[0]  # in-place problems
                k = kind_of(params[0].annotation) if params else None
            else:
                k = kind_of(ret_annotation)
            if k == "list" or isinstance(value, ListNode):
                value = from_list_node(value)
            elif k == "tree" or isinstance(value, TreeNode):
                value = from_tree(value)
        json.dumps(value)
        result = {"ok": True, "value": value, "method": name}
    except BaseException as exc:  # noqa: BLE001 - report everything
        tb = traceback.format_exc(limit=6)
        result = {"ok": False, "error": f"{type(exc).__name__}: {exc}",
                  "traceback": tb}
    sys.stdout = real_stdout
    sys.stdout.write(buf.getvalue()[:65536])
    sys.stdout.write("\n" + MARK + json.dumps(result, default=str) + "\n")


if __name__ == "__main__":
    main()
