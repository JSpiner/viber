#!/bin/bash

echo "🚀 Building optimized DMG..."

# Clean previous builds
rm -rf dist

# Build with optimization flags
npx electron-builder --mac dmg \
  --config electron-builder.json \
  --config.compression=maximum \
  --config.mac.target.arch=universal

# Report size
if [ -f dist/*.dmg ]; then
  echo "✅ Build complete!"
  echo "📦 DMG size: $(ls -lh dist/*.dmg | awk '{print $5}')"
else
  echo "❌ Build failed"
  exit 1
fi