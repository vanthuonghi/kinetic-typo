#!/usr/bin/env python3
"""Pipeline script for kinetic-typo skill: generate script → push → download → upload to Drive."""
import json
import os
import subprocess
import sys
import time
import urllib.request

REPO_DIR = os.path.expanduser("~/.hermes/profiles/short-video/kinetic-typo")
CONFIG_PATH = os.path.join(REPO_DIR, "src", "video-config.json")
OUTPUT_DIR = os.path.expanduser("~/.hermes/profiles/short-video/cache/kinetic-videos")
RCLONE = os.path.expanduser("~/.local/bin/rclone")
GH = "/usr/local/bin/gh"


def run(cmd, **kw):
    print(f"$ {' '.join(cmd)}", file=sys.stderr)
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def generate_script(topic: str, duration_s: int = 75) -> dict:
    """Generate a full video-config.json from a topic using LLM."""
    scene_count = max(6, min(14, duration_s // 7))
    prompt = (
        "Bạn là biên kịch TikTok/Shorts tiếng Việt về phát triển bản thân, kiến thức, kỹ năng.\n"
        f"Chủ đề: {topic}\n\n"
        f"Hãy viết {scene_count} câu ngắn cho video kinetic typography, mỗi câu tối đa 70 ký tự, "
        "tổng thời lượng khoảng 60-90 giây.\n"
        "Scene đầu tiên là hook (câu hỏi / câu gây sốc), scene cuối là cta (kêu gọi theo dõi).\n"
        "Mỗi câu là một ý giá trị, thực tế, có thể áp dụng ngay. KHÔNG sáo rỗng.\n"
        "Trả về JSON thuần (không markdown):\n"
        '{"scenes": [{"text": "...", "highlight": "...", "kind": "hook|body|cta"}, ...]}\n'
        '"highlight" là từ/cụm quan trọng nhất trong câu (có thể để trống).\n'
        "Tiếng Việt tự nhiên, không trang trọng quá."
    )

    payload = {
        "model": "deepseek-v4-flash",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.8,
        "max_tokens": 1000,
    }

    # Try ARK_API_KEY first, then Hermes API
    api_key = os.environ.get("ARK_API_KEY", "")
    api_url = "https://ark.ap-southeast.bytepluses.com/api/coding/v3/chat/completions"

    if not api_key:
        # Fallback: use a simple template
        return _fallback_script(topic)

    req = urllib.request.Request(
        api_url,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.load(resp)
        content = data["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        scenes = json.loads(content).get("scenes", [])
    except Exception as e:
        print(f"LLM error: {e}", file=sys.stderr)
        scenes = _fallback_script(topic)["scenes"]

    if len(scenes) < 4:
        scenes = _fallback_script(topic)["scenes"]

    # Ensure first is hook, last is cta
    if scenes:
        scenes[0]["kind"] = "hook"
        scenes[-1]["kind"] = "cta"
    for s in scenes:
        s.setdefault("highlight", "")
        s.setdefault("kind", "body")
        s["startMs"] = 0
        s["endMs"] = 0

    return {
        "theme": {
            "id": "neon-blue",
            "bg": ["#000814", "#000814", "#000814"],
            "text": "#00d4ff",
            "accent": "#ff006e",
            "muted": "#ffffff",
        },
        "effect": "word-rise",
        "brand": "Văn Hỉ Official",
        "voice": "vi-VN-NamMinhNeural",
        "scenes": scenes,
        "totalMs": 0,
        "hasAudio": False,
    }


def _fallback_script(topic: str) -> dict:
    scenes = [
        {"text": f"Bạn có biết {topic} thay đổi cuộc sống thế nào không?", "highlight": topic, "kind": "hook"},
        {"text": "Hãy bắt đầu với những bước nhỏ mỗi ngày", "highlight": "bước nhỏ", "kind": "body"},
        {"text": "Chỉ 5 phút mỗi sáng, bạn sẽ thấy khác biệt", "highlight": "5 phút", "kind": "body"},
        {"text": "Kiên trì 21 ngày để tạo thói quen mới", "highlight": "21 ngày", "kind": "body"},
        {"text": "Đừng chờ đợi, hãy bắt đầu ngay hôm nay", "highlight": "bắt đầu", "kind": "body"},
        {"text": "Theo dõi để không bỏ lỡ những mẹo hay mỗi ngày", "highlight": "Theo dõi", "kind": "cta"},
    ]
    return {
        "theme": {
            "id": "neon-blue",
            "bg": ["#000814", "#000814", "#000814"],
            "text": "#00d4ff",
            "accent": "#ff006e",
            "muted": "#ffffff",
        },
        "effect": "word-rise",
        "brand": "Văn Hỉ Official",
        "voice": "vi-VN-NamMinhNeural",
        "scenes": scenes,
        "totalMs": 0,
        "hasAudio": False,
    }


def write_config(config: dict):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    print(f"✓ Written {CONFIG_PATH}", file=sys.stderr)


def git_push():
    os.chdir(REPO_DIR)
    r = run(["git", "add", "src/video-config.json"])
    if r.returncode != 0:
        print(f"git add failed: {r.stderr}", file=sys.stderr)
        return False
    r = run(["git", "diff", "--cached", "--quiet"])
    if r.returncode == 0:
        print("ℹ No changes to commit", file=sys.stderr)
        return True
    r = run(["git", "commit", "-m", "feat: update video script"])
    if r.returncode != 0:
        print(f"git commit failed: {r.stderr}", file=sys.stderr)
        return False
    r = run(["git", "push", "origin", "main"])
    if r.returncode != 0:
        print(f"git push failed: {r.stderr}", file=sys.stderr)
        return False
    print("✓ Pushed to GitHub", file=sys.stderr)
    return True


def wait_for_workflow(timeout=600):
    """Wait for the latest workflow run to complete and return the artifact URL."""
    os.chdir(REPO_DIR)
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = run([GH, "run", "list", "--limit", "1", "--json", "databaseId,status,conclusion"])
        if r.returncode != 0:
            print(f"gh run list error: {r.stderr}", file=sys.stderr)
            time.sleep(10)
            continue
        runs = json.loads(r.stdout)
        if not runs:
            print("⏳ No runs found yet...", file=sys.stderr)
            time.sleep(10)
            continue
        run_data = runs[0]
        rid = run_data["databaseId"]
        status = run_data["status"]
        conclusion = run_data.get("conclusion")
        print(f"⏳ Run #{rid}: {status} {conclusion or ''}", file=sys.stderr)
        if status == "completed":
            if conclusion == "success":
                return rid
            else:
                print(f"❌ Workflow failed: {conclusion}", file=sys.stderr)
                return None
        time.sleep(15)
    print("⏰ Timeout waiting for workflow", file=sys.stderr)
    return None


def download_artifact(run_id: int) -> str:
    """Download the video artifact and return the local path."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.chdir(OUTPUT_DIR)
    r = run([GH, "run", "download", str(run_id), "--name", "kinetic-typo-video"])
    if r.returncode != 0:
        print(f"Download failed: {r.stderr}", file=sys.stderr)
        return ""
    video_path = os.path.join(OUTPUT_DIR, "video.mp4")
    if os.path.exists(video_path):
        size = os.path.getsize(video_path)
        print(f"✓ Downloaded: {video_path} ({size/1024/1024:.1f} MB)", file=sys.stderr)
        return video_path
    print("❌ video.mp4 not found in artifact", file=sys.stderr)
    return ""


def upload_to_drive(local_path: str) -> str:
    """Upload to Google Drive via rclone and return a shareable link."""
    r = run([RCLONE, "--version"])
    if r.returncode != 0:
        print("❌ rclone not available. Install: brew install rclone", file=sys.stderr)
        return ""

    # Check if gdrive remote is configured
    r = run([RCLONE, "listremotes"])
    remotes = r.stdout.strip().splitlines()
    drive_remote = None
    for rem in remotes:
        if "gdrive" in rem or "drive" in rem:
            drive_remote = rem.replace(":", "").strip()
            break

    if not drive_remote:
        print("❌ No Google Drive remote configured. Run: rclone config", file=sys.stderr)
        return ""

    # Upload
    remote_path = f"{drive_remote}:kinetic-typo-videos/{os.path.basename(local_path)}"
    r = run([RCLONE, "copy", local_path, remote_path])
    if r.returncode != 0:
        print(f"Upload failed: {r.stderr}", file=sys.stderr)
        return ""

    # Set sharing
    r = run([RCLONE, "backend", "copy", remote_path, "--json", '{"role": "reader", "type": "anyone"}'])
    if r.returncode != 0:
        # rclone backend setshare syntax varies; try alternative
        r = run([RCLONE, "backend", "set", remote_path, "shared"])

    print(f"✓ Uploaded to Google Drive", file=sys.stderr)
    return remote_path


def main():
    topic = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else ""
    if not topic:
        print("Usage: python3 pipeline.py <chủ đề video>", file=sys.stderr)
        sys.exit(1)

    print(f"🎬 Generating kinetic-typo video for: {topic}", file=sys.stderr)

    # Step 1: Generate script
    print("\n📝 Step 1: Generating script...", file=sys.stderr)
    config = generate_script(topic)
    write_config(config)

    # Step 2: Push to GitHub
    print("\n📤 Step 2: Pushing to GitHub...", file=sys.stderr)
    if not git_push():
        print("❌ Push failed. Try: gh auth login", file=sys.stderr)
        sys.exit(1)

    # Step 3: Wait for render
    print("\n⏳ Step 3: Waiting for GitHub Actions render...", file=sys.stderr)
    run_id = wait_for_workflow()
    if not run_id:
        sys.exit(1)

    # Step 4: Download artifact
    print("\n📥 Step 4: Downloading video...", file=sys.stderr)
    video_path = download_artifact(run_id)
    if not video_path:
        sys.exit(1)

    # Step 5: Upload to Drive
    print("\n☁️ Step 5: Uploading to Google Drive...", file=sys.stderr)
    drive_path = upload_to_drive(video_path)
    if not drive_path:
        print(f"\n📁 Video saved locally: {video_path}", file=sys.stderr)
        print("ℹ Configure rclone for Google Drive: rclone config", file=sys.stderr)
        sys.exit(0)

    print(f"\n✅ Done! Video uploaded: {drive_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
