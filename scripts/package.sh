#!/bin/sh
# Builds the Chrome Web Store upload: dist/maps-lead-scraper-<version>.zip with only the extension files.
set -eu
cd "$(dirname "$0")/.."
version=$(node -p "require('./extension/manifest.json').version")
out="dist/maps-lead-scraper-$version.zip"
mkdir -p dist
rm -f "$out"
(cd extension && zip -qr "../$out" manifest.json src icons -x '*.DS_Store' 'icons/icon.svg')
echo "$out"
