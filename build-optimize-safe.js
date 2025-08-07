#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🎯 Starting safe optimized build process...');

// Step 1: Clean previous builds
console.log('📦 Cleaning previous builds...');
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true, force: true });
}

// Step 2: Build with electron-builder using optimization flags
console.log('🏗️  Building with electron-builder...');

try {
  // Use the external config file with optimization flags
  execSync('npx electron-builder --mac dmg --config electron-builder.json', { 
    stdio: 'inherit',
    env: {
      ...process.env,
      // Force maximum compression
      ELECTRON_BUILDER_COMPRESSION: 'maximum'
    }
  });
  
  console.log('✅ Build optimization complete!');
  
  // Report final size
  if (fs.existsSync('dist')) {
    const distFiles = fs.readdirSync('dist');
    for (const file of distFiles) {
      if (file.endsWith('.dmg')) {
        const stats = fs.statSync(path.join('dist', file));
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`📦 Final DMG size: ${sizeMB} MB`);
      }
    }
  }
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}