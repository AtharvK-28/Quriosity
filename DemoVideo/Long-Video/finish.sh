#!/bin/bash
# Run repeatedly until it prints FINISHED. Each run renders ~4 min of frames.
set -e; cd "$(dirname "$0")"
if [ ! -e node_modules/three ]; then rm -f node_modules; mkdir -p deps; (cd deps && npm init -y >/dev/null && npm i -s @fontsource/stix-two-text @fontsource/stix-two-math @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono three@0.160.0 >/dev/null); ln -sfn deps/node_modules node_modules; fi
out=$(python3 cap.py); echo "$out"
if echo "$out" | grep -q "ALL FRAMES DONE"; then
  mkdir -p out
  python3 -c "from PIL import Image; im=Image.open('poster.png').convert('RGB'); im.save('out/quriosity-launch.jpg',quality=92); im.save('frames/f0000.jpg',quality=95)"
  ffmpeg -y -v error -framerate 30 -i frames/f%04d.jpg -i score_norm.wav -map 0:v -map 1:a -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart out/quriosity-launch.mp4
  echo "FINISHED: out/quriosity-launch.mp4"
fi
