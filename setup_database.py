import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB = ROOT / "data" / "cp_offline.db"

conn = sqlite3.connect(DB)
conn.execute("PRAGMA journal_mode=WAL")

conn.executescript("""
CREATE TABLE IF NOT EXISTS problems (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    title TEXT NOT NULL,
    difficulty TEXT,
    rating INTEGER,
    url TEXT,
    statement TEXT,
    input_format TEXT,
    output_format TEXT,
    examples TEXT,
    tags TEXT,
    source_file TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS progress (
    problem_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'not_started',
    attempts INTEGER NOT NULL DEFAULT 0,
    solved INTEGER NOT NULL DEFAULT 0,
    language TEXT,
    time_spent_seconds INTEGER DEFAULT 0,
    notes TEXT,
    last_attempted TEXT,
    FOREIGN KEY(problem_id) REFERENCES problems(id)
);

CREATE INDEX IF NOT EXISTS idx_problems_platform
ON problems(platform);

CREATE INDEX IF NOT EXISTS idx_problems_difficulty
ON problems(difficulty);

CREATE INDEX IF NOT EXISTS idx_problems_rating
ON problems(rating);

CREATE INDEX IF NOT EXISTS idx_progress_status
ON progress(status);
""")

# Import LeetCode
leetcode_dir = ROOT / "problems" / "leetcode"
leetcode_count = 0

for path in leetcode_dir.glob("*.json"):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))

        problem_id = str(
            data.get("frontend_id")
            or data.get("questionFrontendId")
            or path.stem
        )

        title = data.get("title") or path.stem

        topics = data.get("topics") or data.get("topicTags") or []
        if isinstance(topics, list):
            tags = json.dumps([
                x.get("name", x) if isinstance(x, dict) else x
                for x in topics
            ])
        else:
            tags = json.dumps(topics)

        statement = (
            data.get("content")
            or data.get("description")
            or data.get("problem")
            or ""
        )

        examples = (
            data.get("examples")
            or data.get("exampleTestcases")
            or ""
        )

        conn.execute("""
            INSERT OR REPLACE INTO problems
            (id, platform, title, difficulty, rating, url,
             statement, input_format, output_format, examples,
             tags, source_file)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            f"leetcode:{problem_id}",
            "leetcode",
            title,
            data.get("difficulty"),
            None,
            f"https://leetcode.com/problems/{path.stem}/",
            statement,
            data.get("input"),
            data.get("output"),
            json.dumps(examples) if not isinstance(examples, str) else examples,
            tags,
            str(path.relative_to(ROOT))
        ))

        leetcode_count += 1

    except Exception as e:
        print(f"Skipping {path.name}: {e}")

conn.commit()

print(f"Imported LeetCode: {leetcode_count}")
print(f"Database: {DB}")
print(f"Size: {DB.stat().st_size / 1024 / 1024:.2f} MB")

conn.close()
