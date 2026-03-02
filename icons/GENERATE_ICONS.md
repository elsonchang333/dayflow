# DayFlow 圖標生成指南

## 方法 1：在線工具（推薦）

1. 訪問 https://www.pwabuilder.com/imageGenerator
2. 上傳 icon.svg 文件
3. 選擇背景色：#667eea 或漸層
4. 選擇 padding：適中
5. 生成並下載所有尺寸

## 方法 2：Figma/Sketch

1. 導入 icon.svg
2. 導出各尺寸 PNG：
   - 72x72
   - 96x96
   - 128x128
   - 144x144
   - 152x152
   - 192x192
   - 384x384
   - 512x512

## 方法 3：命令行（Mac）

```bash
# 安裝 ImageMagick
brew install imagemagick

# 生成所有尺寸
for size in 72 96 128 144 152 192 384 512; do
  convert icon.svg -resize ${size}x${size} icons/icon-${size}x${size}.png
  echo "Generated ${size}x${size}"
done
```

## 文件命名

- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png
- icon-384x384.png
- icon-512x512.png

生成後上傳到 GitHub 倉庫根目錄即可！
