# 🎬 Kinetic Typography Video Generator

Video short (9:16 / 4:5 / 1:1) chỉ từ **text + giọng đọc**: không ảnh, không footage.
Chữ hiện theo nhịp nói thật (karaoke), nền gradient động, có sẵn 7 hiệu ứng và
4 kiểu chuyển cảnh.

## Yêu cầu

| Thứ | Phiên bản đã test | Ghi chú |
|---|---|---|
| Node.js | 22 | npm 10+ |
| FFmpeg | 8.0 | cần `ffmpeg`, `ffprobe` trong PATH |
| Python | 3.11+ | `pip install edge-tts==7.3.1` |

```bash
npm ci                      # hoặc npm install
pip install edge-tts==7.3.1
```

## Quy trình 3 bước

```bash
# 1. Sửa lời + theme trong src/video-config.json
# 2. Sinh giọng đọc + timing từng từ (ghi vào public/voiceover.mp3 + config)
python3 scripts/prepare.py

# 3. Kiểm tra chất lượng rồi render
python3 scripts/check_quality.py
npm run build               # -> out/video.mp4
```

Preview trực tiếp khi đang chỉnh: `npm start` (Remotion Studio, `http://localhost:3000`).

## `src/video-config.json`

Đây là **file duy nhất** cần sửa cho nội dung. `prepare.py` sẽ ghi lại
`startMs` / `endMs` / `words` / `totalMs` vào cùng file, nên đừng sửa tay mấy
trường đó.

```jsonc
{
  "theme": {
    "bg": ["#000814", "#000814", "#000814"], // 3 màu nền gradient
    "text": "#00d4ff",
    "accent": "#ff006e",
    "muted": "#ffffff"
  },
  "effect": "karaoke",              // xem bảng hiệu ứng bên dưới
  "brand": "Văn Hỉ Official",       // watermark góc trên + nút CTA
  "voice": "vi-VN-NamMinhNeural",   // hoặc vi-VN-HoaiMyNeural (nữ)
  "width": 1080,                    // đổi tỉ lệ khung ở đây
  "height": 1920,
  "scenes": [
    { "text": "AI phân tích 10", "highlight": "", "kind": "hook" },
    { "text": "000 báo cáo mỗi giây", "highlight": "báo cáo", "kind": "body" },
    { "text": "Đăng ký để học ngay", "highlight": "Đăng ký", "kind": "cta" }
  ],
  "totalMs": 15000,
  "hasAudio": true
}
```

- `kind`: `hook` (scene đầu, chữ to hơn 6%), `body`, `cta` (kèm nút "Theo dõi …").
- `highlight`: từ (hoặc cụm) sẽ tô màu accent. Không phân biệt dấu.
- `scenes[].text` là **một câu mỗi scene** — prosody tự nhiên hơn là cắt vụn.

### Tỉ lệ khung

`width`/`height` nhận bất kỳ giá trị nào. Mọi khoảng đệm, cỡ chữ, vị trí
brand/progress bar đều suy ra từ khung tham chiếu 1080×1920 nên 4:5 hay 1:1
không bị lệch bố cục:

```jsonc
"width": 1080, "height": 1350   // 4:5 feed
"width": 1080, "height": 1080   // 1:1
```

## Hiệu ứng

| `effect` | Mô tả |
|---|---|
| `karaoke` | Cả câu mờ, từng từ sáng lên đúng lúc giọng đọc tới (cần `words`) |
| `word-rise` | Từng từ trượt lên, có gạch chân cho từ highlight |
| `line-mask` | Cả khối chữ được "mở" từ dưới lên như mặt nạ |
| `slam` | Cả khối đập xuống kèm flash trắng |
| `wave` | Từng ký tự nhún sóng |
| `typewriter` | Gõ từng ký tự, có con trỏ nhấp nháy |
| `sweep` | Quét sáng dần từng từ |

Chuyển cảnh (`fade`, `slide-up`, `wipe`, `punch`) tự luân phiên theo thứ tự
scene, lệch pha theo `effect` đang chọn.

## Font

Be Vietnam Pro (Black 900 + ExtraBold 800, subset Latin + Vietnamese) được
**self-host** trong `public/fonts/` và nạp qua `FontFace` trong `src/fonts.ts`
kèm `delayRender()`.

Lý do: trước đây code gọi `Helvetica Neue / Segoe UI / Roboto` — không font nào
có trên máy CI Linux, nên preview trên Mac và video render ra khác nhau. Font
vendored cũng bảo đảm render không phụ thuộc mạng.

Cỡ chữ được fit bằng `canvas.measureText` (`layoutScene` trong `src/Video.tsx`),
không dùng ước lượng "trung bình mỗi ký tự rộng 0.545em" nữa — ước lượng đó vừa
tràn khung với glyph rộng, vừa thu nhỏ chữ vô ích với câu nhiều chữ hẹp.

## Đồng bộ chữ với giọng đọc

`scripts/prepare.py`:

1. Gọi edge-tts cho từng scene (tự thử lại với biến thể dấu câu, rồi chia đôi,
   rồi từng từ nếu Edge không trả audio).
2. Chuẩn hoá loudness từng clip về −15 LUFS.
3. Dò khoảng lặng bằng `ffmpeg silencedetect` (`-35dB`, dài ≥ 0.18s).
4. Rải từ theo trọng số âm tiết **trên tổng thời lượng có tiếng**, rồi map ngược
   về thời gian thực — nên chữ không "chạy" trong lúc người nói ngừng nghỉ.
   Giọng Anh có WordBoundary từ Edge thì dùng thẳng số đo của Edge.
5. Nối các clip, ghi `public/voiceover.mp3` và timing vào config.

## Quality gate

`scripts/check_quality.py` chặn các lỗi làm hỏng video thật: scene quá ngắn để
đọc, chữ quá dày, tương phản chữ/nền thấp, thiếu word timing, từ nằm ngoài
scene, timing không tăng dần, khoảng lặng bất thường giữa câu. Lỗi nặng exit 1;
cảnh báo về gu thẩm mỹ chỉ in ra.

## Cấu trúc

```
kinetic-typo/
├── .github/workflows/render.yml  # CI: render khi push (cần secret ARK_API_KEY)
├── public/fonts/                 # Be Vietnam Pro (self-host)
├── public/voiceover.mp3          # sinh bởi prepare.py (gitignore)
├── scripts/
│   ├── prepare.py                # TTS + timing + trộn audio
│   ├── check_quality.py          # quality gate
│   ├── generate_script.py        # sinh kịch bản mới bằng model (tuỳ chọn, CI dùng)
│   └── generate-tts.py           # đường cũ: chỉ đọc script.txt -> voiceover.mp3
├── src/
│   ├── Root.tsx                  # đăng ký composition, đọc width/height/fps
│   ├── Video.tsx                 # scene, hiệu ứng, transitions, brand
│   ├── fonts.ts                  # nạp font local
│   └── video-config.json         # ⬅ NỘI DUNG VIDEO
├── script.txt                    # chỉ còn dùng cho generate-tts.py (đường cũ)
└── remotion.config.ts
```

## Troubleshooting

| Triệu chứng | Xử lý |
|---|---|
| `edge-tts produced no audio` | Edge đổi API/rate limit → chạy lại; kiểm tra `voice` có đúng tên không |
| `Chữ bị tràn khung` | Quality gate báo `won't fit the frame` → rút ngắn text hoặc tách thêm scene |
| `Render chậm` | Giảm `width`/`height`, giảm `--concurrency`, hoặc tăng `--crf` |
| `Browser ... not found` | `npx remotion browser ensure` |
| `Module not found` | `npm ci` |

## Ghi chú

- `node_modules/` từng bị commit vào repo; `.gitignore` đã có `node_modules/`
  và thư mục này đã được bỏ khỏi git index (`git rm -r --cached node_modules`).
- `@remotion/google-fonts` còn trong `package.json` nhưng không còn được dùng —
  có thể gỡ khi bạn muốn dọn dependency.
