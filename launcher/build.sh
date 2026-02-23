#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "==> Installing dependencies..."
npm install

echo "==> Building for all platforms..."
node build.js

echo "==> Artifacts:"
ls -lh ../dist/*.zip
