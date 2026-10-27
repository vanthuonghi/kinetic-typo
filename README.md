# 🎬 Kinetic Typography Video Generator

Tạo video 15 giây chỉ bằng code — **không cần ảnh, không cần video, chỉ cần voice + text chuyển động**.

## 🚀 Quick Start

### 1. Clone hoặc tạo repo trên GitHub
```bash
git clone https://github.com/YOUR_USERNAME/kinetic-typo.git
cd kinetic-typo
```

### 2. Cài đặt dependencies (chỉ cần làm 1 lần)
```bash
npm install
```

### 3. Chỉnh sửa script
Mở file `script.txt` và thay đổi nội dung lời nói.

**Quy tắc vàng**: Mỗi dòng = 1 đoạn text hiển thị trong 3 giây.

### 4. Chạy preview trên máy (MacBook)
```bash
npm start
```
Mở browser tại `http://localhost:3000` để xem preview.

### 5. Push lên GitHub để render
```bash
git add .
git commit -m "Update script"
git push
```

### 6. Lấy video
- Vào tab **Actions** trên GitHub
- Chọn workflow vừa chạy
- Download artifact **video-15s**

## 📝 Cách chỉnh sửa video

### Thay đổi script
Mở `script.txt`:
```
Đoạn 1 (3 giây)
Đoạn 2 (3 giây)
Đoạn 3 (3 giây)
...
```

### Thay đổi style text
Mở `src/Video.tsx`, tìm `VIDEO_CONFIG`:
```typescript
const VIDEO_CONFIG = {
  fps: 30,
  width: 1080,
  height: 1920,
  scenes: [
    {
      text: "Bạn có biết?",
      highlight: "", // Từ khóa cần highlight (màu vàng)
      duration: 3, // Thời gian hiển thị (giây)
      color: "#ffffff", // Màu text
    },
  ],
};
```

### Thay đổi giọng đọc
Mở `scripts/generate-tts.py`, đổi dòng:
```python
VOICE = "vi-VN-NamMinhNeural"  # Nam
# HOẶC
VOICE = "vi-VN-HoaiMyNeural"  # Nữ
```

### Thay đổi độ phân giải
```typescript
// Trong src/Root.tsx
width={1080},  // 1080 = Full HD, 720 = HD
height={1920}, // 1920 = 9:16 (Shorts/Reels), 1080 = 16:9 (YouTube)
```

## 🎨 Tùy chỉnh nâng cao

### Đổi màu nền gradient
Trong `src/Video.tsx`, tìm dòng `background`:
```typescript
background: `linear-gradient(${gradientShift * 0.1}deg, #0f0c29, #1a1a3e, #24243e)`,
```
Thay 3 mã màu này bằng màu bạn muốn.

### Đổi màu highlight
```typescript
color: "#ffd700", // Vàng gold
// HOẶC
color: "#00d4ff", // Xanh cyan
// HOẶC
color: "#ff6b6b", // Đỏ coral
```

### Đổi font chữ
```typescript
fontFamily: "Inter, Arial, sans-serif",
// HOẶC
fontFamily: "Roboto, sans-serif",
// HOẶC
fontFamily: "Montserrat, sans-serif",
```

### Đổi kích thước chữ
```typescript
fontSize: 72, // Tăng/giảm theo ý bạn
```

## 📦 Cấu trúc project

```
kinetic-typo/
├── .github/workflows/
│   └── render.yml          # Tự động render khi push
├── scripts/
│   └── generate-tts.py    # Tạo giọng đọc
├── src/
│   ├── Video.tsx          # Code chính - video composition
│   └── Root.tsx           # Đăng ký composition
├── script.txt             # 📝 NỘI DUNG VIDEO - chỉnh sửa ở đây
├── package.json
├── tsconfig.json
└── remotion.config.ts
```

## 🔧 Troubleshooting

### Lỗi "Module not found"
```bash
npm install
```

### Lỗi "edge-tts not found"
```bash
pip3 install edge-tts
```

### Video render lâu
- Giảm `duration` trong `VIDEO_CONFIG`
- Giảm `width/height` trong `Root.tsx`

### Text bị tràn
- Giảm `fontSize` trong `Video.tsx`
- Giảm độ dài text trong `script.txt`

## 🎯 Next Steps

Khi bạn đã quen với template này, nâng cấp lên:

1. **Thêm subtitle file** (.srt) để FFmpeg burn-in
2. **Thêm nhạc nền** (tải từ YouTube Audio Library)
3. **Thêm logo watermark**
4. **Thêm hiệu ứng chuyển scene** (fade, slide)
5. **Tạo nhiều template** (vertical, horizontal, square)

## 📚 Tài liệu

- Remotion Docs: https://www.remotion.dev/docs
- Edge TTS: https://github.com/rany2/edge-tts
- GitHub Actions: https://docs.github.com/en/actions

## 💡 Tips

- **Test script trước**: Đọc to script.txt để kiểm tra thời lượng (~15 giây)
- **Mỗi đoạn 3-4 giây**: Đủ người đọc hiểu, không bị quá nhanh
- **Highlight 1-2 từ**: Không quá nhiều, làm mất focus
- **Dùng text ngắn**: "Speed reading" thay vì "Phương pháp đọc nhanh tốc độ cao"

## 🆘 Support

Nếu gặp vấn đề, kiểm tra:
1. GitHub Actions logs (xem lỗi ở bước nào)
2. Remotion Studio preview (chạy `npm start`)
3. File `script.txt` có đúng format không
