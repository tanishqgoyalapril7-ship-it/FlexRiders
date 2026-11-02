#!/bin/sh
# Renders screenshots.html slides 1–6 to screenshots/0N.png at 1080x1920 (Google Play phone size).
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for n in 1 2 3 4 5 6; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=540,960 --virtual-time-budget=8000 \
    --screenshot="$PWD/screenshots/0$n.png" "file://$PWD/screenshots.html#$n" 2>/dev/null
done
# Brand (customer) screenshots: brand-screenshots.html -> screenshots/brand/0N.png.
for n in 1 2 3 4 5 6; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=540,960 --virtual-time-budget=8000 \
    --screenshot="$PWD/screenshots/brand/0$n.png" "file://$PWD/brand-screenshots.html#$n" 2>/dev/null
done
# Feature graphic: 1024x500.
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1024,500 --virtual-time-budget=8000 \
  --screenshot="$PWD/screenshots/feature-graphic.png" "file://$PWD/feature-graphic.html" 2>/dev/null
# Play rejects alpha in some assets; flatten to JPEG copies too.
for f in screenshots/*.png screenshots/brand/*.png; do sips -s format jpeg -s formatOptions 92 "$f" --out "${f%.png}.jpg" >/dev/null; done
