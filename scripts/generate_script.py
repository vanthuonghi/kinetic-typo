#!/usr/bin/env python3
"""Generate a fresh, high-value Vietnamese script for a kinetic typography video.

Uses the BytePlus ModelArk endpoint (deepseek-v4-flash) so the content is
never a repeat of the fixed pool. Output: one JSON object on stdout:
  {"script": "Câu 1. Câu 2. ... Đăng ký để học ngay.",
   "topic": "speed-reading"}
"""
import json
import os
import random
import sys
import urllib.request

CONFIG = "/home/ubuntu/.hermes/profiles/quan-ly/config.yaml"
API_URL = "https://ark.ap-southeast.bytepluses.com/api/coding/v3/chat/completions"
MODEL = "deepseek-v4-flash"


def load_api_key():
    with open(CONFIG, encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if s.startswith("api_key:") and not s.startswith("#"):
                return s.split(":", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("api_key not found in config.yaml")


TOPICS = [
    ("speed-reading", "tăng tốc đọc sách, phương pháp đọc nhanh, mắt và não bộ"),
    ("investing", "tư duy đầu tư, giá trị thực, kiên nhẫn, lợi nhuận kép"),
    ("real-estate", "khởi nghiệp BĐS, đòn bẩy tài chính, vị trí, dòng tiền"),
    ("self-development", "thói quen nhỏ, kỷ luật, phát triển bản thân, tư duy tăng trưởng"),
    ("productivity", "phương pháp 80/20, tập trung, quản lý thời gian, loại bỏ việc thừa"),
    ("communication", "lắng nghe, đặt câu hỏi mở, thấu hiểu, kết nối thật sự"),
]


def build_prompt(topic, theme_hint):
    return (
        "Bạn là biên kịch nội dung cho kênh TikTok/Shorts tiếng Việt về phát triển bản thân.\n"
        f"Chủ đề: {topic} ({theme_hint}).\n"
        "Hãy viết đúng 4 câu ngắn (mỗi câu <= 60 ký tự), mỗi câu là một ý giá trị, thực tế, "
        "có thể áp dụng ngay. Câu cuối cùng phải là lời kêu gọi 'Đăng ký để học ngay'.\n"
        "Quy tắc:\n"
        "- KHÔNG dùng câu sáo rỗng hay triết lý chung chung; mỗi câu phải có con số, kỹ thuật hoặc ví dụ cụ thể.\n"
        "- Tiếng Việt tự nhiên, không trang trọng quá.\n"
        "- Trả về JSON duy nhất: {\"script\": \"Câu 1. Câu 2. Câu 3. Câu 4. Đăng ký để học ngay.\"}\n"
        "Không thêm bất kỳ giải thích nào khác."
    )


def generate():
    topic, hint = random.choice(TOPICS)
    prompt = build_prompt(topic, hint)
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.8,
        "max_tokens": 300,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {load_api_key()}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    content = data["choices"][0]["message"]["content"].strip()

    # Try to parse JSON; fall back to raw content.
    try:
        # strip code fences if present
        if content.startswith("```"):
            content = content.strip("`").strip()
            if content.lower().startswith("json"):
                content = content[4:].strip()
        obj = json.loads(content)
        script = obj["script"]
    except Exception:
        script = content

    # Ensure CTA is present
    low = script.lower()
    if "đăng ký" not in low and "subscribe" not in low:
        script = script.rstrip(" .") + ". Đăng ký để học ngay."

    # Split into at most 5 sentences and trim each
    parts = [p.strip() for p in script.split(".") if p.strip()]
    parts = parts[:5]
    script = ". ".join(parts) + "."

    print(json.dumps({"script": script, "topic": topic}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        generate()
    except Exception as e:
        # Fallback: print a useful static script so the pipeline never breaks.
        fb = ("Bạn có biết? Người bình thường đọc 200 từ mỗi phút. "
              "Với speed reading, bạn đọc 1000 từ mỗi phút. "
              "Một cuốn sách chỉ trong 3 phút. Đăng ký để học ngay.")
        print(json.dumps({"script": fb, "topic": "speed-reading"}, ensure_ascii=False))
        sys.stderr.write(f"generate_script fallback: {e}\n")
        sys.exit(0)
