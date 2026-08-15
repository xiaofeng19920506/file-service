#!/bin/sh
set -eu
apt-get update
apt-get install -y --no-install-recommends ffmpeg ca-certificates curl
curl -fsSL -o /usr/local/bin/yt-dlp \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
rm -rf /var/lib/apt/lists/*
yt-dlp --version
