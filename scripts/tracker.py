#!/usr/bin/env python3
"""Local tracker for kinetic-typo video topics, syncs CSV to Google Drive."""
import csv
import json
import os
import subprocess
import sys
from pathlib import Path

TRACKER_PATH = Path(os.path.expanduser("~/.hermes/profiles/short-video/cache/kinetic-videos/tracker.json"))
CSV_PATH = Path(os.path.expanduser("~/.hermes/profiles/short-video/cache/kinetic-videos/danh-sach-chu-de.csv"))
RCLONE = os.path.expanduser("~/.local/bin/rclone")
DRIVE_DIR = "gdrive:kinetic-typo-videos/"
SHEET_ID = "1tgShBqeGHn4RdU-JX6skl_WrY5DXxXMeLr-qr6MGAGI"


def load_tracker():
    if TRACKER_PATH.exists():
        return json.loads(TRACKER_PATH.read_text())
    return []


def save_tracker(data):
    TRACKER_PATH.parent.mkdir(parents=True, exist_ok=True)
    TRACKER_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    sync_csv(data)


def sync_csv(data):
    """Write CSV and upload to Google Drive."""
    with open(CSV_PATH, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["STT", "Chủ đề", "Trạng thái", "Link Video", "Ghi chú"])
        for item in data:
            w.writerow([
                item.get("stt", ""),
                item.get("topic", ""),
                item.get("status", "Chờ làm"),
                item.get("link", ""),
                item.get("note", ""),
            ])
    # Upload to Drive
    subprocess.run(
        [RCLONE, "copy", str(CSV_PATH), DRIVE_DIR],
        capture_output=True, text=True,
    )


def list_topics():
    data = load_tracker()
    if not data:
        print("📋 Danh sách trống. Thêm chủ đề với: add <chủ đề>")
        return
    print(f"\n📋 Danh sách chủ đề ({len(data)} topics):")
    print(f"{'STT':<5} {'Chủ đề':<40} {'Trạng thái':<15} {'Link':<45}")
    print("-" * 105)
    for item in data:
        print(f"{item['stt']:<5} {item['topic']:<40} {item['status']:<15} {item.get('link',''):<45}")


def add_topic(topic):
    data = load_tracker()
    next_stt = max([item["stt"] for item in data], default=0) + 1
    data.append({
        "stt": next_stt,
        "topic": topic,
        "status": "Chờ làm",
        "link": "",
        "note": "",
    })
    save_tracker(data)
    print(f"✓ Đã thêm #{next_stt}: {topic}")


def next_topic():
    data = load_tracker()
    for item in data:
        if item["status"] == "Chờ làm" and item["topic"]:
            return item
    return None


def mark_render(stt):
    data = load_tracker()
    for item in data:
        if item["stt"] == stt:
            item["status"] = "Đang render"
            save_tracker(data)
            print(f"✓ #{stt}: đang render...")
            return True
    print(f"✗ Không tìm thấy STT {stt}")
    return False


def mark_done(stt, link):
    data = load_tracker()
    for item in data:
        if item["stt"] == stt:
            item["status"] = "Hoàn thành"
            item["link"] = link
            save_tracker(data)
            print(f"✓ #{stt}: hoàn thành → {link}")
            return True
    print(f"✗ Không tìm thấy STT {stt}")
    return False


def sheet_url():
    print(f"📊 Google Sheet: https://docs.google.com/spreadsheets/d/{SHEET_ID}")
    print(f"📁 Drive folder: https://drive.google.com/drive/folders/kinetic-typo-videos")


def main():
    if len(sys.argv) < 2:
        print("Usage: tracker.py <action> [args]")
        print("Actions:")
        print("  list                  - Danh sách chủ đề")
        print("  add <chủ đề>          - Thêm chủ đề mới")
        print("  next                  - Lấy chủ đề tiếp theo cần làm")
        print("  render <stt>          - Đánh dấu đang render")
        print("  done <stt> <link>     - Đánh dấu hoàn thành + link video")
        print("  sheet                 - Hiện link Google Sheet")
        return

    action = sys.argv[1]
    if action == "list":
        list_topics()
    elif action == "add":
        topic = " ".join(sys.argv[2:])
        add_topic(topic)
    elif action == "next":
        item = next_topic()
        if item:
            print(f"NEXT_STT={item['stt']}")
            print(f"NEXT_TOPIC={item['topic']}")
        else:
            print("✅ Không còn chủ đề nào chờ làm")
    elif action == "render":
        mark_render(int(sys.argv[2]))
    elif action == "done":
        mark_done(int(sys.argv[2]), sys.argv[3])
    elif action == "sheet":
        sheet_url()
    else:
        print(f"Unknown action: {action}")


if __name__ == "__main__":
    main()
