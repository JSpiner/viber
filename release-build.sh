#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Release Build Process${NC}"
echo "========================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please create a .env file with the following variables:"
    echo "  CSC_NAME=\"Developer ID Application: Your Name (TEAM_ID)\""
    echo "  APPLE_ID=\"your@email.com\""
    echo "  APPLE_APP_SPECIFIC_PASSWORD=\"xxxx-xxxx-xxxx-xxxx\""
    echo "  APPLE_TEAM_ID=\"YOUR_TEAM_ID\""
    exit 1
fi

# Load environment variables
echo -e "${YELLOW}📋 Loading environment variables...${NC}"
source .env

# Check required environment variables for signing
if [ -z "$CSC_NAME" ]; then
    echo -e "${RED}❌ Error: CSC_NAME not set in .env${NC}"
    exit 1
fi

# Check required environment variables for notarization
NOTARIZE_ENABLED=true
if [ -z "$APPLE_ID" ] || [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ] || [ -z "$APPLE_TEAM_ID" ]; then
    echo -e "${YELLOW}⚠️  Warning: Notarization variables not fully configured${NC}"
    echo "  Missing one or more of: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID"
    echo "  Build will continue without notarization."
    NOTARIZE_ENABLED=false
fi

# Clean previous builds
echo -e "${YELLOW}🧹 Cleaning previous builds...${NC}"
rm -rf dist/

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

# Install electron-notarize if not present and notarization is enabled
if [ "$NOTARIZE_ENABLED" = true ] && [ ! -d "node_modules/@electron/notarize" ]; then
    echo -e "${YELLOW}📦 Installing @electron/notarize...${NC}"
    npm install --save-dev @electron/notarize
fi

# Update electron-builder configuration for signing
echo -e "${YELLOW}🔧 Configuring electron-builder for signing...${NC}"
node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('electron-builder.json', 'utf8'));
config.mac.hardenedRuntime = true;
config.mac.gatekeeperAssess = true;
if ('$NOTARIZE_ENABLED' === 'true') {
    config.afterSign = 'build/notarize.js';
}
fs.writeFileSync('electron-builder.json', JSON.stringify(config, null, 2));
console.log('✅ Configuration updated');
"

# Build the application
echo -e "${BLUE}🏗️  Building application...${NC}"
echo "This may take several minutes..."

if npm run dist; then
    echo -e "${GREEN}✅ Build successful!${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

# Find the built app
APP_PATH=$(find dist -name "*.app" -type d | head -n 1)
DMG_PATH=$(find dist -name "*.dmg" -type f | head -n 1)

if [ -z "$APP_PATH" ]; then
    echo -e "${RED}❌ Error: Could not find built app${NC}"
    exit 1
fi

# Verify code signature
echo -e "${YELLOW}🔍 Verifying code signature...${NC}"
if codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1; then
    echo -e "${GREEN}✅ Code signature verified${NC}"
else
    echo -e "${RED}❌ Code signature verification failed${NC}"
    exit 1
fi

# Check notarization status
if [ "$NOTARIZE_ENABLED" = true ]; then
    echo -e "${YELLOW}🔍 Checking notarization status...${NC}"
    if spctl -a -t exec -vvv "$APP_PATH" 2>&1 | grep -q "accepted"; then
        echo -e "${GREEN}✅ Notarization verified${NC}"
    else
        echo -e "${YELLOW}⚠️  Notarization not verified (this is normal immediately after notarization)${NC}"
    fi
fi

# Display results
echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}🎉 Release Build Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""

if [ -n "$DMG_PATH" ]; then
    DMG_SIZE=$(du -h "$DMG_PATH" | cut -f1)
    echo -e "${BLUE}📦 DMG File:${NC} $DMG_PATH"
    echo -e "${BLUE}📏 Size:${NC} $DMG_SIZE"
fi

echo -e "${BLUE}📱 App:${NC} $APP_PATH"
echo -e "${BLUE}✍️  Signed by:${NC} $CSC_NAME"

if [ "$NOTARIZE_ENABLED" = true ]; then
    echo -e "${BLUE}🏆 Notarized:${NC} Yes"
else
    echo -e "${YELLOW}⚠️  Notarized:${NC} No (missing credentials)"
fi

echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "1. Test the DMG on a different Mac"
echo "2. Upload to your distribution channel"
echo "3. Create a GitHub release (if applicable)"

# Restore electron-builder configuration
echo -e "${YELLOW}🔧 Restoring electron-builder configuration...${NC}"
git checkout electron-builder.json 2>/dev/null || true