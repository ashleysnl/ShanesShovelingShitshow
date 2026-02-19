#!/usr/bin/env bash
set -euo pipefail

rm -rf dist
mkdir -p dist
cp -R index.html styles.css src assets README.md DESIGN_NOTES.md test dist/
echo "Build complete: dist/"
