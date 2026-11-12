#!/usr/bin/env python3
"""Convert a CSV file on Google Drive to Google Sheets format."""
import json
import time
import urllib.request
from pathlib import Path

RCLONE_CONF = Path.home() / ".config" / "rclone" / "rclone.conf"
DRIVE_API = "https://www.googleapis.com/drive/v3/files"
SCOPES = "https://www.googleapis.com/auth/drive"

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
            return json.load(resp)
    except urllib.error.HTTPError as e:
        print(f"API error {e.code}: {e.read().decode()[:200]}")
        return None

def main():
    token = get_token()
    access_token = token["access_token"]
    csv_file_id = "1M4dPKtf5uQfWeNcKpkDVSnS_mR2fMTtO"

    print("Converting CSV to Google Sheets format...")

    # Copy the file with Sheets MIME type (import)
    body = {
        "name": "Kinetic Typography - Danh sách chủ đề video",
        "mimeType": "application/vnd.google-apps.spreadsheet",
    }
    result = api_call(
        f"{DRIVE_API}/{csv_file_id}/copy?fields=id",
        method="POST",
        body=body,
        access_token=access_token,
    )
    if not result:
        print("Failed to convert. Trying to update MIME type...")
        return

    sheet_id = result["id"]
    print(f"✓ Sheet created: {sheet_id}")

    # Delete the original CSV
    api_call(f"{DRIVE_API}/{csv_file_id}", method="DELETE", access_token=access_token)

    # Share with anyone
    time.sleep(2)
    perm_result = api_call(
        f"{DRIVE_API}/{sheet_id}/permissions",
        method="POST",
        body={"type": "anyone", "role": "writer"},
        access_token=access_token,
    )
    if perm_result:
        print("✓ Sharing enabled")

    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}"
    print(f"\n📊 {url}")

if __name__ == "__main__":
    main()
