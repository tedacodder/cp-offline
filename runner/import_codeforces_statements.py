import json
import sqlite3
import time
import urllib.request
import urllib.error
import http.client

DB = "data/cp_offline.db"

API = (
    "https://datasets-server.huggingface.co/rows"
    "?dataset=open-r1/codeforces"
    "&config=default"
    "&split=train"
    "&offset={offset}"
    "&length={length}"
)

# Small batches are much safer on a slow/unstable connection.
BATCH_SIZE = 25

# Start from the beginning. Already-imported statements are skipped.
START_OFFSET = 0

MAX_RETRIES = 5
RETRY_DELAY = 3

REQUEST_TIMEOUT = 120


def fetch_batch(offset, length):
    url = API.format(offset=offset, length=length)

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "cp-offline-codeforces-importer/1.0",
            "Accept": "application/json",
        },
    )

    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(
                f"  Request attempt {attempt}/{MAX_RETRIES}...",
                flush=True,
            )

            with urllib.request.urlopen(
                request,
                timeout=REQUEST_TIMEOUT,
            ) as response:
                return json.load(response)

        except (
            urllib.error.URLError,
            urllib.error.HTTPError,
            TimeoutError,
            TimeoutError,
            ConnectionError,
            http.client.IncompleteRead,
        ) as e:
            last_error = e

            print(
                f"  Request failed: {type(e).__name__}: {e}",
                flush=True,
            )

            if attempt < MAX_RETRIES:
                delay = RETRY_DELAY * attempt
                print(
                    f"  Retrying in {delay} seconds...",
                    flush=True,
                )
                time.sleep(delay)

    raise RuntimeError(
        f"Failed after {MAX_RETRIES} attempts: {last_error}"
    )


def main():
    conn = sqlite3.connect(DB)

    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    total_fetched = 0
    matched = 0
    updated = 0
    already_done = 0
    skipped = 0

    offset = START_OFFSET

    print("Starting Codeforces statement import...")
    print(f"Database:   {DB}")
    print(f"Batch size: {BATCH_SIZE}")
    print()

    while True:
        print(f"Fetching offset {offset}...", flush=True)

        try:
            data = fetch_batch(offset, BATCH_SIZE)

        except Exception as e:
            print()
            print(f"STOPPED SAFELY at offset {offset}")
            print(f"Reason: {e}")
            print()
            print("All previous committed batches are safe.")
            break

        rows = data.get("rows", [])

        if not rows:
            print()
            print("No more rows returned.")
            break

        batch_matched = 0
        batch_updated = 0
        batch_already_done = 0
        batch_skipped = 0

        for item in rows:
            row = item.get("row", {})

            contest_id = row.get("contest_id")
            index = row.get("index")

            if contest_id is None or not index:
                skipped += 1
                batch_skipped += 1
                continue

            problem_id = f"codeforces:{contest_id}{index}"

            existing = conn.execute(
                """
                SELECT statement
                FROM problems
                WHERE id = ?
                  AND platform = 'codeforces'
                """,
                (problem_id,),
            ).fetchone()

            if not existing:
                skipped += 1
                batch_skipped += 1
                continue

            matched += 1
            batch_matched += 1

            # Don't rewrite statements already imported.
            if existing[0] and existing[0].strip():
                already_done += 1
                batch_already_done += 1
                continue

            description = row.get("description") or ""
            input_format = row.get("input_format") or ""
            output_format = row.get("output_format") or ""

            examples = row.get("examples")

            if examples is None:
                examples_text = ""
            else:
                examples_text = json.dumps(
                    examples,
                    ensure_ascii=False,
                )

            conn.execute(
                """
                UPDATE problems
                SET
                    statement = ?,
                    input_format = ?,
                    output_format = ?,
                    examples = ?
                WHERE id = ?
                  AND platform = 'codeforces'
                """,
                (
                    description,
                    input_format,
                    output_format,
                    examples_text,
                    problem_id,
                ),
            )

            updated += 1
            batch_updated += 1

        conn.commit()

        total_fetched += len(rows)

        print(
            f"  fetched={len(rows):2d} "
            f"matched={batch_matched:2d} "
            f"updated={batch_updated:2d} "
            f"already_done={batch_already_done:2d} "
            f"skipped={batch_skipped:2d}",
            flush=True,
        )

        print(
            f"  totals: fetched={total_fetched} "
            f"updated={updated} "
            f"already_done={already_done} "
            f"skipped={skipped}",
            flush=True,
        )

        offset += len(rows)

        # End of dataset.
        if len(rows) < BATCH_SIZE:
            print()
            print("Reached the end of the available dataset.")
            break

        # Give the API and the laptop a short break.
        time.sleep(1)

    conn.close()

    print()
    print("=" * 60)
    print("IMPORT FINISHED / STOPPED")
    print("=" * 60)
    print(f"Rows fetched:     {total_fetched}")
    print(f"Rows matched:     {matched}")
    print(f"Rows updated:     {updated}")
    print(f"Already imported: {already_done}")
    print(f"Rows skipped:     {skipped}")


if __name__ == "__main__":
    main()
