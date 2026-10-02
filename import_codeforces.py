import sqlite3
import json

DB = "data/cp_offline.db"
CF_DB = "data/codeforces-source/codeforces.db"

conn = sqlite3.connect(DB)
cf = sqlite3.connect(CF_DB)

# Build tags lookup
tags = {
    row[0]: row[1]
    for row in cf.execute("SELECT tag_id, tag_key FROM tags")
}

# Build problem -> tags mapping
problem_tags = {}

for problem_id, tag_id in cf.execute(
    "SELECT problem_id, tag_id FROM problems_tags"
):
    problem_tags.setdefault(problem_id, []).append(tags.get(tag_id, ""))

rows = cf.execute("""
    SELECT
        problem_id,
        problem_name,
        difficulty_rating,
        problem_url
    FROM problems
""")

inserted = 0

for problem_id, title, rating, url in rows:
    tags_json = json.dumps(
        problem_tags.get(problem_id, []),
        ensure_ascii=False
    )

    conn.execute("""
        INSERT OR REPLACE INTO problems (
            id,
            platform,
            title,
            difficulty,
            rating,
            url,
            statement,
            input_format,
            output_format,
            examples,
            tags,
            source_file
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        f"codeforces:{problem_id}",
        "codeforces",
        title,
        None,
        rating,
        url,
        None,
        None,
        None,
        None,
        tags_json,
        "data/codeforces-source/codeforces.db"
    ))

    inserted += 1

conn.commit()

print(f"Imported Codeforces problems: {inserted}")

print("\n=== TOTAL COUNTS ===")

for platform, count in conn.execute("""
    SELECT platform, COUNT(*)
    FROM problems
    GROUP BY platform
    ORDER BY platform
"""):
    print(f"{platform}: {count}")

conn.close()
cf.close()
