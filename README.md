# CP Offline

Offline Codeforces + LeetCode training platform. Python standard library, SQLite, vanilla JS. No installs.

    cd cp-offline/web && python3 server.py      # then open http://127.0.0.1:8000

Requires Python 3.9+ and `g++` (C++17) for C++ runs. On first start the server applies a safe, idempotent
migration (`web/db.py`, schema v2): it only adds columns/tables/indexes and never deletes problems or progress.
Back up `data/cp_offline.db` before the first run anyway.

## Pages
Dashboard `/` · Problems `/problems.html` (filters kept in the URL) · Topics · Practice · Contests · Review queue ·
Problem page (statement, editor, console, notes, submission history).

## Running code
- Run Examples: judges the stored examples, records nothing.  Submit / Test: same, and records an attempt + history.
- Custom Input: run your program on any stdin.
- Verdicts: PASS, WRONG ANSWER, COMPILE ERROR, RUNTIME ERROR, TIME LIMIT EXCEEDED (5 s/test), UNSUPPORTED, NO EXAMPLES.
  Results are labelled SAMPLE TEST; the app never says ACCEPTED because only examples are available.
- Codeforces: stdin/stdout, token-wise comparison (floats within 1e-6).
- LeetCode: Python only. `class Solution` is called with arguments parsed from the example text; `ListNode`/`TreeNode`
  helpers are provided. Design-style (class-simulation) and SQL problems are reported UNSUPPORTED. C++ can be
  compiled/run with Custom Input but cannot be auto-tested (LeetCode has no stdin format).

## Data notes
- Progress statuses: not_started, attempted, review, solved. "Attempted" in stats = any problem with attempts > 0
  (solved problems keep their attempts). Marking Solved never touches attempts.
- Codeforces has no Easy/Medium/Hard; it is derived from rating (<=1200 / <=1900 / above) for filtering only.
- About 17% of Codeforces problems have no statement/examples in the DB (shown with a link to the source).
- Many LeetCode statements have no Constraints section in the dataset; this is stated on the page.
- Codeforces tags contained empty placeholder strings; they are ignored. Tags shown are the dataset's own tags.
- `solved_at` did not exist before; for the one pre-existing solved row it was backfilled from `last_attempted`.

## Files
`web/server.py` API + static server · `web/db.py` migrations · `runner/engine.py` sandboxed execution ·
`runner/lc_harness.py`, `runner/lcparse.py` LeetCode support · original CLI tools in `runner/` still work.
