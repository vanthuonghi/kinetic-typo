#!/usr/bin/env python3
"""
Tạo file audio TTS từ script.txt
Chạy: python3 generate-tts.py
"""

import asyncio
import edge_tts
import os

SCRIPT_FILE = "script.txt"
OUTPUT_FILE = "voiceover.mp3"
VOICE = "vi-VN-NamMinhNeural"  # Nam: NamMinhNeural | Nữ: HoaiMyNeural


async def main():
    # Đọc script
    if not os.path.exists(SCRIPT_FILE):
        print(f"❌ Không tìm thấy {SCRIPT_FILE}")
        print("Tạo file script.txt với nội dung lời nói của video")
        return

    with open(SCRIPT_FILE, "r", encoding="utf-8") as f:
        text = f.read().strip()

    if not text:
        print("❌ File script.txt rỗng")
        return

    print(f"🎙️  Đang tạo audio với giọng {VOICE}...")
    print(f"📝 Text: {text[:100]}...")

    # Tạo TTS
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(OUTPUT_FILE)

    file_size = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"✅ Đã tạo {OUTPUT_FILE} ({file_size:.2f} MB)")


if __name__ == "__main__":
    asyncio.run(main())
