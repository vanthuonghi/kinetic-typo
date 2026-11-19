# 🎬 Kinetic Typography Video Generator

Video short (9:16 / 4:5 / 1:1) chỉ từ **text + giọng đọc**: không footage, chữ là nhân vật chính.
Chữ hiện theo nhịp nói thật (karaoke / spotlight, timing **đo từ audio**), **nền ảnh mờ**
chuyển cảnh mượt + gradient động, 9 hiệu ứng chữ (chọn được theo từng scene),
4 kiểu chuyển cảnh, brand chip, progress bar segmented, nhạc nền tự ducking theo
giọng và SFX chuyển cảnh.

## Yêu cầu

| Thứ | Phiên bản đã test | Ghi chú |
|---|---|---|
| Node.js | 22 | npm 10+ |
| FFmpeg | 8.0 | cần `ffmpeg`, `ffprobe` trong PATH |
| Python | 3.11+ | `pip install edge-tts==7.3.1` |
| faster-whisper | 1.1.1 (tuỳ chọn) | `pip install faster-whisper` — đo word timing từ audio thật |

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
  "effect": "auto",                 // auto: hook→slam, body→karaoke, cta→pop
  "brand": "Văn Hỉ Official",       // watermark góc trên + nút CTA
  "voice": "vi-VN-NamMinhNeural",   // hoặc vi-VN-HoaiMyNeural (nữ)
  "width": 1080,                    // đổi tỉ lệ khung ở đây
  "height": 1920,
  "background": {                    // ảnh nền mờ; bỏ "image" -> dùng gradient
    "image": "backgrounds/bg-bokeh.jpg",
    "blur": 24,                      // px trên khung 1080, 20-30 là đủ
    "zoom": 1.14,                    // phóng nhẹ để giấu mép mờ
    "kenBurns": true,                // đẩy chậm vào trong mỗi scene
    "darken": 0.35,                  // lớp tối phẳng phủ lên ảnh
    "vignette": 0.55,               // tối 4 góc
    "grain": 0.06                    // hạt phim, 0 = tắt
  },
  "chrome": { "brand": true, "counter": true, "progress": true },
  "music": {                         // bỏ "track" -> video chỉ có giọng đọc
    "track": "music/bed-warm.mp3",
    "gainDb": -20,                   // mức nhạc so với giọng
    "fadeInMs": 900,
    "fadeOutMs": 1800
  },
  "sfx": { "whoosh": true, "click": true, "volume": 0.35 },
  "transition": "auto",             // auto | fade | slide-up | wipe | punch
  "scenes": [
    { "text": "AI phân tích 10", "highlight": "", "kind": "hook" },
    { "text": "000 báo cáo mỗi giây", "highlight": "báo cáo", "kind": "body" },
    // effect của riêng scene này, đè lên "effect" toàn video
    { "text": "Nấu cùng táo đỏ", "highlight": "táo đỏ", "kind": "body", "effect": "spotlight" },
    { "text": "Đăng ký để học ngay", "highlight": "Đăng ký", "kind": "cta" }
  ],
  "totalMs": 15000,
  "hasAudio": true
}
```

- `kind`: `hook` (scene đầu, chữ to hơn 6%), `body`, `cta` (kèm nút "Theo dõi …").
- `highlight`: từ (hoặc cụm) sẽ tô màu accent. Không phân biệt dấu, và được
  khớp theo **cả cụm theo thứ tự** — `"giảm độ sáng"` sẽ không làm sáng chữ
  `độ` nằm trong `chế độ`. Quality gate cảnh báo nếu cụm này không có trong câu.
- `scenes[].text` là **một câu mỗi scene** — prosody tự nhiên hơn là cắt vụn.
- `scenes[].image` (tuỳ chọn): đổi ảnh nền riêng cho scene đó, ví dụ cảnh nói về
  đọc giấy thì dùng ảnh bàn giấy. Hai ảnh khác nhau tự cross-fade trong 0,5s.

### Hình nền mờ

`background.image` là đường dẫn trong `public/` (ví dụ `backgrounds/bg-bokeh.jpg`).
Ảnh được phủ `object-fit: cover`, làm mờ theo `blur`, phóng `zoom`, rồi đẩy chậm
vào trong (Ken Burns, đổi hướng mỗi scene) để khung hình không bị "chết".
Thứ tự lớp: gradient theme → ảnh mờ → quầng sáng accent → scrim tối giữa khung →
vignette → hạt phim, nên chữ vẫn đọc rõ trên ảnh sáng hay nhiều chi tiết.

Ảnh càng nét càng đẹp, nhưng file 1000–2000px là đủ vì đằng nào cũng bị làm mờ.

### Nhạc nền & SFX

`music.track` là một file trong `public/music/`. `prepare.py` loop nhạc cho dài
bằng giọng đọc, fade in/out, rồi **ducking bằng `sidechaincompress`**: nhạc tự
nhỏ lại mỗi khi có giọng, nên không phải hạ volume tay. Mix cuối được chuẩn hoá
−14 LUFS / −1.5 dBTP — mức các nền tảng short-form chuẩn hoá về.

Hai bản nhạc có sẵn (`bed-warm`, `bed-neon`) và hai SFX (`whoosh` khi chuyển
scene, `click` khi CTA vào) được **sinh bằng code**, không dùng sample:

```bash
python3 scripts/make_music.py   # ~3 phút, chỉ cần chạy lại khi muốn đổi nhạc
```

SFX không trộn vào MP3 mà phát bằng `<Audio>` trong composition, nên khớp
frame tuyệt đối. Tắt bằng `sfx.whoosh` / `sfx.click`, hoặc bỏ cả cụm `sfx`.

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
| `spotlight` | Chỉ từ đang đọc sáng rõ, các từ còn lại chìm xuống (cần `words`) |
| `pop` | Từng từ bật lên có độ nảy, từ highlight nổi bật nhất |

`karaoke`, `spotlight` và `pop` tô nền accent mờ (marker) cho từ highlight —
đọc tốt hơn trên ảnh nền so với chỉ đổi màu chữ.

Đặt `"effect": "auto"` để mỗi scene tự chọn theo `kind` (hook → `slam`,
body → `karaoke`, cta → `pop`) — video có nhịp thay vì một điệu từ đầu đến cuối.
Muốn khác thì thêm `"effect"` vào **một scene** bất kỳ; scene đó dùng effect riêng,
các scene còn lại vẫn theo `effect` toàn video.

Chuyển cảnh (`fade`, `slide-up`, `wipe`, `punch`) tự luân phiên theo thứ tự
scene, lệch pha theo `effect` đang chọn. Đặt `"transition": "fade"` để cố định
một kiểu cho cả video.

## Chrome

`chrome.brand` bật chip brand góc trên trái (kèm equalizer nhún theo nhịp),
`chrome.counter` bật số scene `03 / 12` góc phải, `chrome.progress` bật thanh
tiến trình chia đoạn theo từng scene — nhìn chuyên nghiệp hơn một thanh trơn.
Tắt từng cái bằng `false`. Nút CTA ở scene `cta` có sheen chạy qua và viền pulse.

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

Câu dài giờ được xuống tối đa 3 dòng ở cỡ chữ lớn nhất còn vừa khung, thay vì
thu nhỏ chữ cho vừa một dòng — chữ to hơn hẳn trên điện thoại.

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
6. Nếu có `faster-whisper`, `scripts/align.py` **nghe lại từng clip** và lấy
   timestamp thật của từng từ, rồi ghép với câu gốc bằng `difflib`: từ nào
   Whisper nghe đúng thì dùng số đo, từ bị nghe sai thì lấy ước lượng âm tiết
   và kẹp giữa hai từ đo được. Đây là lý do số ("12 tiếng") và tên riêng không
   còn lệch dần về cuối câu. Không cài Whisper thì pipeline vẫn chạy như cũ;
   `alignSource` trong config cho biết scene nào là `whisper`, scene nào `estimate`.

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
├── public/backgrounds/           # ảnh nền mờ (bg-bokeh, bg-paper)
├── public/music/                 # nhạc nền sinh bởi make_music.py
├── public/sfx/                   # whoosh + click sinh bởi make_music.py
├── public/voiceover.mp3          # sinh bởi prepare.py (gitignore)
├── scripts/
│   ├── prepare.py                # TTS + timing + mix nhạc
│   ├── align.py                  # đo word timing bằng faster-whisper (tuỳ chọn)
│   ├── make_music.py             # sinh nhạc nền + SFX (stdlib, không sample)
│   ├── check_quality.py          # quality gate
│   ├── generate_script.py        # sinh kịch bản mới bằng model (tuỳ chọn, CI dùng)
│   └── generate-tts.py           # đường cũ: chỉ đọc script.txt -> voiceover.mp3
├── src/
│   ├── Root.tsx                  # đăng ký composition, đọc width/height/fps
│   ├── config.ts                 # type + giá trị mặc định của theme/background/chrome
│   ├── Background.tsx            # ảnh nền mờ, cross-fade, scrim, vignette, grain
│   ├── Video.tsx                 # scene, hiệu ứng, transitions, chrome
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
| `Nền đen, không thấy ảnh` | Sai đường dẫn `background.image` (tính từ `public/`); quality gate báo lỗi này |
| `Không có nhạc trong video` | `music.track` sai đường dẫn, hoặc thiếu file — quality gate chặn; xem dòng `Mixed music bed` khi chạy `prepare.py` |
| `Nhạc lấn giọng` | Giảm `music.gainDb` (ví dụ −24), hoặc tăng `sfx.volume` nếu chỉ thiếu tiếng động |
| `Timing vẫn lệch dù đã cài whisper` | Model `base` nghe tiếng Việt ở mức khá; đặt `ALIGN_MODEL=small`. Xem `alignSource` trong config: `estimate` nghĩa là Whisper bị bỏ qua (thiếu package, hoặc transcript khớp < 50%) |
| `Render chậm bất thường` | Hạ `background.blur` xuống 20–24; blur lớn là thứ đắt nhất trong khung hình |
| `Browser ... not found` | `npx remotion browser ensure` |
| `Failed to launch the browser process` + lỗi `VideoToolbox` trên macOS 12 | Chrome headless-shell mới không chạy trên macOS 12; render trên CI, hoặc tải Chrome for Testing 120 và truyền `--browser-executable=.../chrome-headless-shell` |
| `Module not found` | `npm ci` |

## Ghi chú

- `node_modules/` từng bị commit vào repo; `.gitignore` đã có `node_modules/`
  và thư mục này đã được bỏ khỏi git index (`git rm -r --cached node_modules`).
- `@remotion/google-fonts` còn trong `package.json` nhưng không còn được dùng —
  có thể gỡ khi bạn muốn dọn dependency.
