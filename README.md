# CP Offline

**CP Offline** is a lightweight, offline-first competitive programming training platform for **Codeforces and LeetCode**.

It is designed for learning, practicing, solving, reviewing, tracking progress, running supported examples locally, and analyzing competitive-programming activity without depending on an internet connection during normal use.

The project uses:

* Python 3.9+
* SQLite
* Python standard library
* HTML
* CSS
* Vanilla JavaScript
* `g++` / C++17 for C++ execution

It does **not** require Node.js, React, Next.js, PostgreSQL, Redis, or Docker for normal use.

---

# Table of Contents

* [Features](#features)
* [Requirements](#requirements)
* [Project Structure](#project-structure)
* [Quick Start](#quick-start)
* [Database Setup and Migration](#database-setup-and-migration)
* [Testing](#testing)
* [Running Code](#running-code)
* [Codeforces Support](#codeforces-support)
* [LeetCode Support](#leetcode-support)
* [Progress Tracking](#progress-tracking)
* [Pages](#pages)
* [Data Notes](#data-notes)
* [Important Files](#important-files)
* [Database Backup and Restore](#database-backup-and-restore)
* [Troubleshooting](#troubleshooting)
* [Git and GitHub](#git-and-github)
* [Offline Design](#offline-design)
* [Security](#security)
* [Known Limitations](#known-limitations)
* [Development Workflow](#development-workflow)
* [Quick Reference](#quick-reference)

---

# Features

## Problem Database

The platform stores Codeforces and LeetCode problems locally in SQLite.

The database currently contains approximately:

* **14,087 total problems**
* **11,174 Codeforces problems**
* **2,913 LeetCode problems**

The exact counts can change if the dataset is updated.

---

## Dashboard

The dashboard provides an overview of your practice activity, including:

* Total problems
* Solved problems
* Attempted problems
* Problems needing review
* Progress percentage
* Total attempts
* Codeforces statistics
* LeetCode statistics
* Daily activity
* Recent submissions
* Current/active contest information when available
* Solving streak information

---

## Problem Browser

The problem browser supports:

* Codeforces problems
* LeetCode problems
* Search
* Platform filtering
* Difficulty filtering
* Rating-based filtering
* Tags/topics
* Problem status
* Problem links
* URL-preserved filters

---

## Individual Problem Page

A problem page can contain:

* Problem title
* Platform
* Difficulty
* Rating
* Tags
* Statement
* Input format
* Output format
* Examples
* Code editor
* Test/run controls
* Custom input
* Notes
* Submission history
* Progress information

---

## Practice

The Practice page provides a focused way to select and solve problems from the local database.

It integrates with the same problem, progress, status, and runner systems used throughout the application.

---

## Review Queue

Problems can be placed into a review workflow.

Supported progress statuses are:

```text
not_started
attempted
review
solved
```

The Review page provides a dedicated place to return to problems that need additional practice.

---

## Topics

The Topics page organizes problems through their available tags/topics.

This allows targeted practice around algorithmic concepts instead of choosing problems completely at random.

---

## Contests

The platform includes contest-related pages for practicing in a contest-style workflow.

Contest functionality is designed around the locally available problem and progress data.

---

# Requirements

## Python

Python **3.9 or newer** is required.

Check your version:

```bash
python3 --version
```

---

## C++

C++ execution requires `g++` with C++17 support.

Check:

```bash
g++ --version
```

The runner invokes C++ using the C++17 standard.

---

## SQLite

SQLite is used as the local database.

Check:

```bash
sqlite3 --version
```

The application can also use Python's built-in SQLite support through the `sqlite3` module.

---

# Project Structure

```text
cp-offline/
├── data/
│   ├── cp_offline.db
│   ├── leetcode-source/
│   ├── codeforces-source/
│   └── llm-samples/
│       ├── codeforces/
│       └── leetcode/
│
├── problems/
│   ├── codeforces/
│   └── leetcode/
│
├── runner/
│   ├── engine.py
│   ├── import_codeforces_statements.py
│   ├── lc_harness.py
│   ├── lcparse.py
│   ├── progress.py
│   ├── run_cpp.py
│   ├── run_python.py
│   ├── submit.py
│   └── test_examples.py
│
├── solutions/
│   ├── codeforces/
│   └── leetcode/
│
├── tracker/
│
├── web/
│   ├── contest.html
│   ├── contests.html
│   ├── db.py
│   ├── index.html
│   ├── practice.html
│   ├── problem.html
│   ├── problems.html
│   ├── review.html
│   ├── server.py
│   ├── topics.html
│   └── static/
│       ├── common.js
│       ├── contest.js
│       ├── contests.js
│       ├── dashboard.js
│       ├── practice.js
│       ├── problem.js
│       ├── problems.js
│       ├── review.js
│       ├── style.css
│       ├── theme.js
│       └── topics.js
│
├── import_codeforces.py
├── setup_database.py
└── README.md
```

---

# Quick Start

## Step 1 — Enter the project

```bash
cd ~/A2SV/cp-offline
```

If the project is somewhere else, replace the path accordingly.

---

## Step 2 — Verify the database

```bash
ls -lh data/cp_offline.db
```

The populated SQLite database should exist.

---

## Step 3 — Start the server

```bash
cd web
python3 server.py
```

Keep this terminal running.

---

## Step 4 — Open the application

Open:

```text
http://127.0.0.1:8000
```

The dashboard should load.

---

# Database Setup and Migration

CP Offline uses a local SQLite database:

```text
data/cp_offline.db
```

The repository includes the populated database, so a normal installation does **not** require rebuilding the complete problem dataset.

## How migration works

When the server starts, `web/db.py` automatically:

1. Opens `data/cp_offline.db`.
2. Checks the current database schema.
3. Determines whether required schema changes are missing.
4. Creates missing tables when necessary.
5. Adds missing columns when necessary.
6. Adds required indexes or migration metadata.
7. Preserves existing problem data.
8. Preserves existing progress data.
9. Finishes initialization.
10. Starts the web server.

The migration is **safe and idempotent**.

That means starting the application multiple times does not repeatedly recreate the same migration.

The migration is designed to add required schema changes rather than delete the existing problem dataset or progress.

---

# Database Migration — Step by Step

## Step 1 — Enter the project

```bash
cd ~/A2SV/cp-offline
```

---

## Step 2 — Verify the database exists

```bash
ls -lh data/cp_offline.db
```

You should see the SQLite database file.

---

## Step 3 — Back up the database

Before the first migration, create a backup:

```bash
cp data/cp_offline.db data/cp_offline.db.backup
```

Verify both files:

```bash
ls -lh data/cp_offline.db data/cp_offline.db.backup
```

---

## Step 4 — Start the application

```bash
cd web
python3 server.py
```

At startup, the application initializes the database and applies the required migration.

---

## Step 5 — Open the application

Open:

```text
http://127.0.0.1:8000
```

---

## Step 6 — Verify the database contents

Open another terminal:

```bash
cd ~/A2SV/cp-offline
```

Run:

```bash
python3 - <<'PY'
import sqlite3

db = sqlite3.connect("data/cp_offline.db")

print("Total problems:", db.execute(
    "SELECT COUNT(*) FROM problems"
).fetchone()[0])

print("Codeforces:", db.execute(
    "SELECT COUNT(*) FROM problems WHERE platform='codeforces'"
).fetchone()[0])

print("LeetCode:", db.execute(
    "SELECT COUNT(*) FROM problems WHERE platform='leetcode'"
).fetchone()[0])

db.close()
PY
```

The current database should report approximately:

```text
Total problems: 14087
Codeforces: 11174
LeetCode: 2913
```

These numbers are dataset-dependent and may change after future updates.

---

## Step 7 — Verify the progress table

Run:

```bash
python3 - <<'PY'
import sqlite3

db = sqlite3.connect("data/cp_offline.db")

print("Progress rows:", db.execute(
    "SELECT COUNT(*) FROM progress"
).fetchone()[0])

db.close()
PY
```

This confirms that the progress table is accessible.

---

## Step 8 — Inspect database tables

Run:

```bash
sqlite3 data/cp_offline.db ".tables"
```

The database should contain the application's main tables, including:

```text
problems
progress
```

---

## Step 9 — Inspect the problems schema

```bash
sqlite3 data/cp_offline.db ".schema problems"
```

---

## Step 10 — Inspect the progress schema

```bash
sqlite3 data/cp_offline.db ".schema progress"
```

---

# Important Database Rule

Normally, **do not delete the database and rebuild it just to perform a migration**.

The normal process is:

```text
Start server
     ↓
web/db.py opens SQLite
     ↓
Current schema is checked
     ↓
Required migration is applied
     ↓
Existing data is preserved
     ↓
Application starts
```

`setup_database.py` is a setup/database-building utility. It is **not normally required every time the application starts**.

If you already have the populated `cp_offline.db`, keep using it.

---

# Moving the Project to Another Computer

When moving the project, make sure the populated database is copied with the project:

```text
data/cp_offline.db
```

Then:

```bash
cd cp-offline/web
python3 server.py
```

The application will perform any required schema migration automatically.

Do not replace the populated database with a new empty database unless you intentionally want to rebuild the dataset.

---

# Testing

Testing should be performed progressively.

Recommended order:

```text
1. Python syntax
2. Runner tests
3. Database verification
4. Server startup
5. API test
6. Dashboard
7. Problems page
8. Individual problem
9. Code execution
10. Progress tracking
11. Review queue
12. Contests
13. Topics
```

---

## Step 1 — Python Syntax Check

From the project root:

```bash
cd ~/A2SV/cp-offline
python3 -m py_compile web/server.py web/db.py runner/*.py
```

No output normally means the Python files compiled successfully.

---

## Step 2 — Test the Example Runner

```bash
python3 runner/test_examples.py
```

This checks stored-example execution functionality.

---

## Step 3 — Start the Web Server

```bash
cd web
python3 server.py
```

Keep the server running.

---

## Step 4 — Test the Statistics API

Open another terminal:

```bash
curl -s http://127.0.0.1:8000/api/stats
```

The response should be valid JSON containing information such as:

```text
total
solved
attempted
not_started
by_status
total_attempts
platforms
percent_solved
daily
review_queue
recent_submissions
```

---

## Step 5 — Test the Dashboard

Open:

```text
http://127.0.0.1:8000/
```

Verify:

* Total problems load.
* Solved count loads.
* Attempted count loads.
* Review count loads.
* Progress percentage loads.
* Platform statistics load.
* Daily activity loads.
* Recent activity loads.
* No JavaScript errors appear.

---

## Step 6 — Test the Problem Browser

Open:

```text
http://127.0.0.1:8000/problems.html
```

Verify:

* Codeforces problems appear.
* LeetCode problems appear.
* Search works.
* Platform filtering works.
* Difficulty/rating filtering works where applicable.
* Tags appear.
* Problem links work.
* Status information appears.
* URL filters are preserved.

---

## Step 7 — Test an Individual Problem

Open a problem.

Verify:

* Title
* Platform
* Difficulty
* Rating when available
* Statement
* Input format
* Output format
* Examples
* Tags
* Editor
* Test/run controls
* Custom input
* Notes
* Submission history
* Progress

---

## Step 8 — Test Code Execution

Use a problem with stored examples.

Run the examples and verify that the application correctly reports the execution result.

Possible verdicts include:

```text
PASS
WRONG ANSWER
COMPILE ERROR
RUNTIME ERROR
TIME LIMIT EXCEEDED
UNSUPPORTED
NO EXAMPLES
```

---

## Step 9 — Test Progress Tracking

Attempt a problem.

Verify that:

* Attempt count changes.
* Submission/attempt history is recorded where applicable.
* Status changes correctly.
* Dashboard statistics update.
* Solved state is preserved.
* Existing attempts are not lost.

---

## Step 10 — Test Review

Open:

```text
http://127.0.0.1:8000/review.html
```

Verify that problems marked for review appear in the review queue.

---

## Step 11 — Test Contests

Open:

```text
http://127.0.0.1:8000/contests.html
```

Verify that contest information loads and contest pages can be opened.

---

## Step 12 — Test Topics

Open:

```text
http://127.0.0.1:8000/topics.html
```

Verify that topics/tags load and lead to the appropriate problem sets.

---

# Running Code

The platform can execute supported local solutions.

## Run Examples

Stored examples can be executed without changing progress.

Example execution is intended for checking whether a solution produces the expected output for the available examples.

---

## Test / Submit

Testing/submitting a solution can record an attempt and submission history.

The local system only has the examples stored in the database. It is therefore not equivalent to submitting to the official Codeforces or LeetCode judge.

---

## Custom Input

Custom input allows a program to be executed against user-provided stdin.

This is useful for debugging and experimentation.

---

# Verdicts

The local runner can report:

```text
PASS
WRONG ANSWER
COMPILE ERROR
RUNTIME ERROR
TIME LIMIT EXCEEDED
UNSUPPORTED
NO EXAMPLES
```

The time limit for local sample execution is **5 seconds per test**.

Results based only on stored examples are labelled as sample tests.

The application does not claim that passing stored examples means that the solution is accepted by the complete online judge.

---

# Codeforces Support

Codeforces problems use the standard:

```text
stdin → program → stdout
```

model.

The local runner compares output against expected output.

Comparison is token-based.

Floating-point values are accepted within the configured tolerance of approximately:

```text
1e-6
```

---

## Codeforces Difficulty

Codeforces does not use the same Easy/Medium/Hard classification as LeetCode.

For local filtering, difficulty is derived from rating:

```text
≤ 1200       → Easy
≤ 1900       → Medium
> 1900       → Hard
```

These labels are application-level filters and are not official Codeforces difficulty labels.

---

# LeetCode Support

LeetCode problems use a different execution model from Codeforces.

The local harness supports supported Python problems using:

```python
class Solution:
    ...
```

The harness parses the stored example information and invokes the appropriate solution method where supported.

---

## Supported Data Structures

The local harness provides support for structures such as:

```text
ListNode
TreeNode
```

where the stored problem format can be parsed by the local harness.

---

## Unsupported LeetCode Types

Some LeetCode problems cannot be executed using the local harness.

Examples include:

* Design/class-simulation problems requiring a different execution model
* SQL problems

These are reported as:

```text
UNSUPPORTED
```

C++ can still be compiled and executed with **Custom Input**, but LeetCode C++ problems cannot automatically use the local stdin-based sample harness in the same way as Codeforces.

---

# Progress Tracking

The progress table stores problem-level state.

Supported statuses:

```text
not_started
attempted
review
solved
```

The progress system can also store:

* Attempts
* Solved state
* Language
* Time spent
* Notes
* Last attempted time
* Submission information where supported

---

## Attempted Statistics

The dashboard's `attempted` statistic means:

```text
attempts > 0
```

A solved problem can therefore also count as attempted.

For example:

```text
Problem:
status = solved
attempts = 5
```

It is:

```text
Solved: yes
Attempted: yes
```

Marking a problem as solved does not automatically erase its previous attempt count.

---

# Pages

## Dashboard

```text
/
```

Main progress and activity dashboard.

---

## Problems

```text
/problems.html
```

Problem browser and filtering.

---

## Practice

```text
/practice.html
```

Focused practice workflow.

---

## Problem

```text
/problem.html?id=...
```

Individual problem page.

---

## Review

```text
/review.html
```

Review queue.

---

## Topics

```text
/topics.html
```

Topic/tag exploration.

---

## Contests

```text
/contests.html
```

Contest browser.

---

## Contest

```text
/contest.html?id=...
```

Individual contest page.

---

# Data Notes

## Codeforces Statement Coverage

Approximately **17% of Codeforces problems** in the current dataset do not contain a complete local statement/examples section.

When local content is unavailable, the application can provide a link back to the source where appropriate.

---

## LeetCode Constraints

Many LeetCode statements in the dataset do not contain a `Constraints` section.

The application does not invent missing constraints.

---

## Codeforces Tags

The imported Codeforces data contains some empty placeholder tag values.

Empty placeholders are ignored when displaying tags.

The displayed tags come from the dataset.

---

## `solved_at`

The current schema includes solved-time information.

For the pre-existing solved record in the original database, `solved_at` was backfilled from the available `last_attempted` value during the migration/update process.

---

# Important Files

## Web Server

```text
web/server.py
```

Provides:

* HTTP server
* API routes
* Page serving
* Application endpoints

---

## Database Layer

```text
web/db.py
```

Responsible for:

* SQLite connection
* Database access
* Schema initialization
* Database migrations
* Application-level database operations

---

## Execution Engine

```text
runner/engine.py
```

Provides the main execution infrastructure.

---

## Python Runner

```text
runner/run_python.py
```

Handles Python execution.

---

## C++ Runner

```text
runner/run_cpp.py
```

Handles C++ compilation/execution.

---

## LeetCode Parser

```text
runner/lcparse.py
```

Parses supported LeetCode example/input structures.

---

## LeetCode Harness

```text
runner/lc_harness.py
```

Executes supported LeetCode `Solution` classes.

---

## Progress System

```text
runner/progress.py
```

Handles runner-related progress functionality.

---

## Submission System

```text
runner/submit.py
```

Handles local submission/test workflow.

---

# Database Backup and Restore

Before making database-related changes, create a backup:

```bash
cp data/cp_offline.db data/cp_offline.db.backup
```

Check:

```bash
ls -lh data/cp_offline.db data/cp_offline.db.backup
```

---

## Restore a Backup

Stop the server first.

Then:

```bash
cp data/cp_offline.db.backup data/cp_offline.db
```

Restart the server:

```bash
cd web
python3 server.py
```

---

# Troubleshooting

## Database File Missing

Check:

```bash
ls -lh data/cp_offline.db
```

If the file is missing, restore it from a known-good backup or obtain the project's populated database.

Do not immediately run database-building scripts if the intention is to preserve the existing dataset.

---

## Server Does Not Start

Run:

```bash
cd ~/A2SV/cp-offline
python3 -m py_compile web/server.py web/db.py runner/*.py
```

If there is a Python syntax error, fix that error before investigating the browser.

---

## API Does Not Respond

Make sure the server is running:

```bash
cd ~/A2SV/cp-offline/web
python3 server.py
```

Then, from another terminal:

```bash
curl -s http://127.0.0.1:8000/api/stats
```

---

## Database Error

First stop the server and make a backup of the current database:

```bash
cp data/cp_offline.db data/cp_offline.db.before-error
```

Inspect the tables:

```bash
sqlite3 data/cp_offline.db ".tables"
```

Inspect the schema:

```bash
sqlite3 data/cp_offline.db ".schema"
```

Do not manually delete tables or columns unless you understand the migration and have a verified backup.

---

## Problem Count Becomes Zero

Stop the server immediately.

Check database files:

```bash
ls -lh data/cp_offline.db*
```

If a known-good backup exists:

```bash
cp data/cp_offline.db.backup data/cp_offline.db
```

Then restart the server and verify the problem count.

---

## Progress Disappeared

Progress is stored in SQLite.

Check available database backups:

```bash
ls -lh data/cp_offline.db*
```

Do not overwrite the current database without first preserving it.

If restoring an older database, remember that the restored database contains the progress state that existed when that backup was created.

---

# Git and GitHub

The project can be tracked with Git.

From the project root:

```bash
cd ~/A2SV/cp-offline
```

Check status:

```bash
git status
```

View changes:

```bash
git diff
```

---

## Initial Commit

For a new repository:

```bash
git add .
```

Then:

```bash
git commit -m "Initial commit"
```

---

## Normal Development Commit

After making a change:

```bash
git status
```

Then:

```bash
git add .
```

Then:

```bash
git commit -m "Describe the change"
```

---

## Check Remote

```bash
git remote -v
```

The intended GitHub repository is:

```text
github.com/tedacodder/cp-offline
```

---

## Push

If the remote is already configured:

```bash
git push
```

---

# Offline Design

CP Offline is designed so that normal operation does not require:

* Codeforces network access
* LeetCode network access
* PostgreSQL
* Redis
* Docker
* Node.js
* React
* Next.js

The primary application data is stored locally.

This makes the platform suitable for environments with limited or unreliable internet connectivity.

---

# Security

The local application is intended primarily for personal/local use.

Running arbitrary user code is inherently security-sensitive.

Important considerations:

* Do not expose the execution server directly to the public internet.
* Do not run untrusted code as a privileged user.
* Be careful when executing programs from unknown sources.
* Keep the application bound to localhost when used as a personal offline tool.
* Review changes to the runner before executing untrusted code.

The local runner should be treated as a code-execution environment, not as a production multi-user sandbox.

---

# Known Limitations

## Online Judge Verification

The application does not replace the official Codeforces or LeetCode judge.

Passing stored examples does not prove that a solution passes every hidden test.

---

## Missing Dataset Content

Some problems do not have complete statements/examples in the local database.

---

## LeetCode Execution

Not every LeetCode problem can be automatically executed.

In particular:

* SQL problems are unsupported by the local Python harness.
* Design-style problems may require unsupported class-simulation behavior.
* Some problem formats may not be parseable from the stored examples.

---

## C++ LeetCode Testing

C++ can be compiled and run with Custom Input, but the automatic LeetCode sample harness is not equivalent to the official LeetCode execution environment.

---

## Codeforces Difficulty

The Easy/Medium/Hard labels are local rating-derived categories, not official Codeforces labels.

---

# Development Workflow

When changing the application, use this workflow:

```text
Make change
    ↓
Check git diff
    ↓
Run Python syntax check
    ↓
Check database if database code changed
    ↓
Start server
    ↓
Test /api/stats
    ↓
Test affected page
    ↓
Test runner if execution code changed
    ↓
Test progress if tracking code changed
    ↓
Review git diff
    ↓
Commit
```

---

# Recommended Verification Checklist

After a substantial change, verify:

```text
[ ] Python syntax passes
[ ] Database exists
[ ] Database backup exists
[ ] Problem count is correct
[ ] Progress table is accessible
[ ] Server starts
[ ] /api/stats works
[ ] Dashboard loads
[ ] Problems page loads
[ ] Search works
[ ] Filters work
[ ] Individual problem loads
[ ] Code editor works
[ ] Example runner works
[ ] Custom input works
[ ] Progress updates
[ ] Review queue works
[ ] Topics page works
[ ] Contest pages work
[ ] No major browser console errors
[ ] Git diff contains only intended changes
```

---

# Quick Reference

## Start

```bash
cd ~/A2SV/cp-offline/web
python3 server.py
```

Open:

```text
http://127.0.0.1:8000
```

---

## Stop Server

Press:

```text
Ctrl+C
```

---

## Python Syntax Check

```bash
cd ~/A2SV/cp-offline
python3 -m py_compile web/server.py web/db.py runner/*.py
```

---

## Runner Test

```bash
python3 runner/test_examples.py
```

---

## API Test

```bash
curl -s http://127.0.0.1:8000/api/stats
```

---

## Database Tables

```bash
sqlite3 data/cp_offline.db ".tables"
```

---

## Database Schema

```bash
sqlite3 data/cp_offline.db ".schema"
```

---

## Database Backup

```bash
cp data/cp_offline.db data/cp_offline.db.backup
```

---

## Database Restore

```bash
cp data/cp_offline.db.backup data/cp_offline.db
```

---

## Git Status

```bash
git status
```

---

## Git Diff

```bash
git diff
```

---

## Commit

```bash
git add .
git commit -m "Describe the change"
```

---

## Push

```bash
git push
```

---

# Project Goal

CP Offline is intended to provide a complete local competitive-programming workflow:

```text
Learn
  ↓
Explore Topics
  ↓
Choose Problems
  ↓
Practice
  ↓
Write Code
  ↓
Run Examples
  ↓
Test
  ↓
Submit Locally
  ↓
Track Progress
  ↓
Review Weak Problems
  ↓
Practice Again
  ↓
Analyze Improvement
```

The goal is to make the platform useful as a long-term **offline Codeforces + LeetCode training environment**, while keeping the implementation lightweight enough to run on modest hardware.
