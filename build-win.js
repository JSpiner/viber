const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function build() {
  log('🚀 Starting Windows Release Build Process', 'blue');
  log('=========================================');

  // Clean previous builds
  log('🧹 Cleaning previous builds...', 'yellow');
  const distPath = path.join(__dirname, 'dist');
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
  }

  // Check if node_modules exists
  if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
    log('📦 Installing dependencies...', 'yellow');
    execSync('npm install', { stdio: 'inherit' });
  }

  // Build the application
  log('🏗️  Building Windows application...', 'blue');
  log('This may take several minutes...');

  try {
    execSync('npx electron-builder --win --config electron-builder.json', {
      stdio: 'inherit',
      cwd: __dirname
    });
    log('✅ Build successful!', 'green');
  } catch (error) {
    log('❌ Build failed', 'red');
    process.exit(1);
  }

  // Find built files
  log('');
  log('=========================================', 'green');
  log('🎉 Windows Build Complete!', 'green');
  log('=========================================', 'green');
  log('');

  // List output files
  if (fs.existsSync(distPath)) {
    const files = fs.readdirSync(distPath);

    // Find installer
    const nsisFile = files.find(f => f.endsWith('.exe') && f.includes('Setup'));
    if (nsisFile) {
      const filePath = path.join(distPath, nsisFile);
      const stats = fs.statSync(filePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      log(`📦 NSIS Installer: ${nsisFile}`, 'blue');
      log(`   Size: ${sizeMB} MB`);
    }

    // Find portable
    const portableFile = files.find(f => f.includes('portable') && f.endsWith('.exe'));
    if (portableFile) {
      const filePath = path.join(distPath, portableFile);
      const stats = fs.statSync(filePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      log(`📦 Portable: ${portableFile}`, 'blue');
      log(`   Size: ${sizeMB} MB`);
    }
  }

  log('');
  log('Next steps:', 'green');
  log('1. Test the installer on a Windows machine');
  log('2. Test the portable version');
  log('3. Upload to your distribution channel');
}

build().catch(error => {
  log(`❌ Error: ${error.message}`, 'red');
  process.exit(1);
});
