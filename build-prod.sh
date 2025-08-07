#!/bin/bash

echo "🚀 Building production DMG with maximum optimization..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist

# Build with all optimizations
echo "🏗️  Building with electron-builder..."
npx electron-builder --mac dmg \
  --config electron-builder.json \
  --config.compression=maximum \
  --config.mac.target.arch=universal \
  --config.npmRebuild=false \
  --config.nodeGypRebuild=false \
  || { echo "❌ Build failed"; exit 1; }

# Report final size
echo ""
echo "✅ Production build complete!"
for dmg in dist/*.dmg; do
  if [ -f "$dmg" ]; then
    size=$(ls -lh "$dmg" | awk '{print $5}')
    echo "📦 DMG size: $size - $(basename "$dmg")"
  fi
done