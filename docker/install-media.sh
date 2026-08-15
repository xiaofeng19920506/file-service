#!/bin/sh
set -eu
apt-get update
apt-get install -y --no-install-recommends ffmpeg ca-certificates curl
# zipapp 版 yt-dlp 依赖 python3；slim 镜像改用独立 linux 二进制
curl -fsSL -o /usr/local/bin/yt-dlp \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux
chmod a+rx /usr/local/bin/yt-dlp
rm -rf /var/lib/apt/lists/*
yt-dlp --version
ffmpeg -version >/dev/null
