#!/usr/bin/env python3
"""Update a Google Sheet with video status and link."""
import json
import time
import urllib.request
import urllib.parse
from pathlib import Path

RCLONE_CONF = Path.home() / ".config" / "rclone" / "rclone.conf"
SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"


def get_token():
    text = RCLONE_CONF.read_text()
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("token ="):
            return json.loads(line.split("=", 1)[1].strip().strip('"').strip("'"))
    raise RuntimeError("No token found")


def api_call(url, method="GET", body=None, access_token=None):
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            text = resp.read().decode()
            if text:
                return json.loads(text)
            return {}
    except urllib.error.HTTPError as e:
        err = e.read().decode()[:300]
        print(f"API error {e.code}: {err}")
        return None


def get_sheet_data(sheet_id, access_token):
    """Get all rows from the sheet."""
    result = api_call(
        f"{SHEETS_API}/{sheet_id}/values/A:E",
        access_token=access_token,
    )
    if result and "values" in result:
        return result["values"]
    return []


def update_row(sheet_id, row_num, values, access_token):
    """Update a specific row in the sheet."""
    range_str = f"A{row_num}:E{row_num}"
    result = api_call(
        f"{SHEETS_API}/{sheet_id}/values/{range_str}?valueInputOption=RAW",
        method="PUT",
        body={"values": [values]},
        access_token=access_token,
    )
    return result is not None


def main():
    import sys
    sheet_id = sys.argv[1] if len(sys.argv) > 1 else ""
    action = sys.argv[2] if len(sys.argv) > 2 else "list"

    if not sheet_id:
        print("Usage: update_sheet.py <sheet_id> <action> [args...]")
        print("Actions:")
        print("  list                    - List all topics")
        print("  next-topic              - Get first topic with status 'Chờ làm'")
        print("  mark-render <stt>       - Mark topic as 'Đang render'")
        print("  mark-done <stt> <link>  - Mark topic as 'Hoàn thành' with video link")
        print("  add <topic>             - Add a new topic")
        return

    token = get_token()
    access_token = token["access_token"]

    rows = get_sheet_data(sheet_id, access_token)
    if not rows:
        print("No data found in sheet")
        return

    if action == "list":
        print(f"\n📋 Danh sách chủ đề ({len(rows)-1} topics):")
        print(f"{'STT':<5} {'Chủ đề':<40} {'Trạng thái':<15} {'Link':<45}")
        print("-" * 105)
        for i, row in enumerate(rows[1:], 1):
            stt = row[0] if len(row) > 0 else str(i)
            topic = row[1] if len(row) > 1 else ""
            status = row[2] if len(row) > 2 else ""
            link = row[3] if len(row) > 3 else ""
            print(f"{stt:<5} {topic:<40} {status:<15} {link:<45}")

    elif action == "next-topic":
        for i, row in enumerate(rows[1:], 2):  # row 2 = first data row
            status = row[2] if len(row) > 2 else ""
            topic = row[1] if len(row) > 1 else ""
            if status == "Chờ làm" and topic.strip():
                stt = row[0] if len(row) > 0 else str(i - 1)
                print(f"NEXT_TOPIC={topic}")
                print(f"NEXT_STT={stt}")
                print(f"NEXT_ROW={i}")
                return
        print("No pending topics found")

    elif action == "mark-render":
        stt = sys.argv[3] if len(sys.argv) > 3 else ""
        for i, row in enumerate(rows[1:], 2):
            if row[0] == stt:
                update_row(sheet_id, i, [row[0], row[1], "Đang render", row[3] if len(row) > 3 else "", row[4] if len(row) > 4 else ""], access_token)
                print(f"✓ Marked STT {stt} as 'Đang render'")
                return
        print(f"STT {stt} not found")

    elif action == "mark-done":
        stt = sys.argv[3] if len(sys.argv) > 3 else ""
        link = sys.argv[4] if len(sys.argv) > 4 else ""
        for i, row in enumerate(rows[1:], 2):
            if row[0] == stt:
                update_row(sheet_id, i, [row[0], row[1], "Hoàn thành", link, row[4] if len(row) > 4 else ""], access_token)
                print(f"✓ Marked STT {stt} as 'Hoàn thành' with link")
                return
        print(f"STT {stt} not found")

    elif action == "add":
        topic = " ".join(sys.argv[3:]) if len(sys.argv) > 3 else ""
        if not topic:
            print("No topic provided")
            return
        next_stt = len(rows)  # because rows includes header
        new_row = [str(next_stt), topic, "Chờ làm", "", ""]
        range_str = f"A{next_stt + 1}:E{next_stt + 1}"
        result = api_call(
            f"{SHEETS_API}/{sheet_id}/values/{range_str}?valueInputOption=RAW",
            method="PUT",
            body={"values": [new_row]},
            access_token=access_token,
        )
        if result:
            print(f"✓ Added topic #{next_stt}: {topic}")
        else:
            print("Failed to add topic")


if __name__ == "__main__":
    main()
