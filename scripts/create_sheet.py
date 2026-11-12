#!/usr/bin/env python3
"""Create a Google Sheet using raw HTTP (no google-auth libraries)."""
import json
import os
import time
import urllib.request
import urllib.error
from pathlib import Path

RCLONE_CONF = Path.home() / ".config" / "rclone" / "rclone.conf"
CLIENT_ID = "202264815644.apps.googleusercontent.com"
CLIENT_SECRET = "X4Z3ca8xfWDb1VOO-FdHu7AC"
TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_API = "https://www.googleapis.com/drive/v3/files"
SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"


def get_token():
    """Get a fresh access token using rclone's refresh token."""
    text = RCLONE_CONF.read_text()
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("token ="):
            token_str = line.split("=", 1)[1].strip().strip('"').strip("'")
            return json.loads(token_str)
    raise RuntimeError("No token found")


def refresh_access(refresh_token):
    """Exchange refresh token for a new access token."""
    data = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=data)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        print(f"Token refresh failed: {e.read().decode()}")
        return None


def api_call(url, method="GET", body=None, access_token=None, headers_extra=None):
    """Make an authenticated Google API call."""
    headers = {"Authorization": f"Bearer {access_token}"}
    if body:
        headers["Content-Type"] = "application/json"
    if headers_extra:
        headers.update(headers_extra)
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        print(f"API error {e.code}: {e.read().decode()}")
        return None


def main():
    token_data = get_token()
    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        print("No refresh token found")
        return

    # Get fresh access token
    new_token = refresh_access(refresh_token)
    if not new_token:
        print("Failed to refresh token, trying existing access_token...")
        access_token = token_data.get("access_token")
    else:
        access_token = new_token.get("access_token")
        # Save updated token
        token_data["access_token"] = access_token
        token_data["expiry"] = time.time() + new_token.get("expires_in", 3600)
        # Update rclone config
        new_conf = f'[gdrive]\ntype = drive\ntoken = {json.dumps(token_data, ensure_ascii=False)}\n'
        RCLONE_CONF.write_text(new_conf)

    if not access_token:
        print("No access token available")
        return

    print("✓ Got access token")

    # Create the sheet file
    body = {
        "name": "Kinetic Typography - Danh sách chủ đề video",
        "mimeType": "application/vnd.google-apps.spreadsheet",
    }
    result = api_call(
        DRIVE_API + "?fields=id",
        method="POST",
        body=body,
        access_token=access_token,
    )
    if not result:
        return

    sheet_id = result["id"]
    print(f"✓ Sheet created: {sheet_id}")

    # Set up headers
    headers = [["STT", "Chủ đề", "Trạng thái", "Link Video", "Ghi chú"]]
    update_result = api_call(
        f"{SHEETS_API}/{sheet_id}/values/A1:E1?valueInputOption=RAW",
        method="PUT",
        body={"values": headers},
        access_token=access_token,
    )
    if not update_result:
        return
    print("✓ Headers written")

    # Formatting and data validation
    fmt_body = {
        "requests": [
            {
                "repeatCell": {
                    "range": {"sheetId": 0, "startRowIndex": 0, "endRowIndex": 1},
                    "cell": {
                        "userEnteredFormat": {
                            "backgroundColor": {"red": 0, "green": 0.05, "blue": 0.03},
                            "textFormat": {
                                "foregroundColor": {"red": 0, "green": 0.83, "blue": 1},
                                "bold": True,
                                "fontSize": 12,
                            },
                            "horizontalAlignment": "CENTER",
                        }
                    },
                    "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
                }
            },
            {"updateDimensionProperties": {
                "range": {"sheetId": 0, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 1},
                "properties": {"pixelSize": 60}, "fields": "pixelSize",
            }},
            {"updateDimensionProperties": {
                "range": {"sheetId": 0, "dimension": "COLUMNS", "startIndex": 1, "endIndex": 2},
                "properties": {"pixelSize": 350}, "fields": "pixelSize",
            }},
            {"updateDimensionProperties": {
                "range": {"sheetId": 0, "dimension": "COLUMNS", "startIndex": 2, "endIndex": 3},
                "properties": {"pixelSize": 120}, "fields": "pixelSize",
            }},
            {"updateDimensionProperties": {
                "range": {"sheetId": 0, "dimension": "COLUMNS", "startIndex": 3, "endIndex": 4},
                "properties": {"pixelSize": 400}, "fields": "pixelSize",
            }},
            {"updateDimensionProperties": {
                "range": {"sheetId": 0, "dimension": "COLUMNS", "startIndex": 4, "endIndex": 5},
                "properties": {"pixelSize": 200}, "fields": "pixelSize",
            }},
            {
                "setDataValidation": {
                    "range": {"sheetId": 0, "startRowIndex": 1, "startColumnIndex": 2, "endColumnIndex": 3},
                    "rule": {
                        "condition": {
                            "type": "ONE_OF_LIST",
                            "values": [
                                {"userEnteredValue": "Chờ làm"},
                                {"userEnteredValue": "Đang render"},
                                {"userEnteredValue": "Hoàn thành"},
                                {"userEnteredValue": "Bỏ qua"},
                            ],
                        },
                        "showCustomUi": True,
                    },
                }
            },
        ]
    }
    fmt_result = api_call(
        f"{SHEETS_API}/{sheet_id}:batchUpdate",
        method="POST",
        body=fmt_body,
        access_token=access_token,
    )
    if not fmt_result:
        return
    print("✓ Formatting applied")

    # Share with anyone with the link (writer)
    perm_result = api_call(
        f"{DRIVE_API}/{sheet_id}/permissions",
        method="POST",
        body={"type": "anyone", "role": "writer"},
        access_token=access_token,
    )
    if not perm_result:
        return
    print("✓ Sharing set to anyone with link")

    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}"
    print(f"\n{'='*60}")
    print(f"📊 SHEET_URL={url}")
    print(f"📊 SHEET_ID={sheet_id}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
