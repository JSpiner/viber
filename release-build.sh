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
if [ -z "$APPLE_APP_SPECIFIC_PASSWORD_PROFILE" ]; then
    echo -e "${YELLOW}⚠️  Warning: APPLE_APP_SPECIFIC_PASSWORD_PROFILE not configured${NC}"
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

# Update electron-builder configuration for signing (disable built-in notarization)
echo -e "${YELLOW}🔧 Configuring electron-builder for signing...${NC}"
node -e "
const fs = require('fs');
try {
  const config = JSON.parse(fs.readFileSync('electron-builder.json', 'utf8'));
  config.mac.hardenedRuntime = true;
  config.mac.gatekeeperAssess = true;
  // Disable built-in notarization - we'll do it manually
  delete config.afterSign;
  fs.writeFileSync('electron-builder.json', JSON.stringify(config, null, 2));
  console.log('✅ Configuration updated');
} catch (err) {
  console.error('❌ Failed to parse electron-builder.json:', err.message);
  process.exit(1);
}
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

# Apply hardened runtime to the built app
echo -e "${YELLOW}🔐 Applying hardened runtime...${NC}"

# Sign all helper apps with hardened runtime
find "$APP_PATH" -name "*.app" -type d ! -path "$APP_PATH" | while read helper_app; do
    codesign --force --deep --options runtime --entitlements build/entitlements.mac.plist --sign "$CSC_NAME" "$helper_app" 2>/dev/null
done

# Sign frameworks with hardened runtime
find "$APP_PATH" -name "*.framework" -type d | while read framework; do
    codesign --force --deep --options runtime --entitlements build/entitlements.mac.plist --sign "$CSC_NAME" "$framework" 2>/dev/null
done

# Sign executables with hardened runtime
find "$APP_PATH" -type f -perm +111 ! -name "*.dylib" ! -name "*.so" 2>/dev/null | while read executable; do
    if file "$executable" 2>/dev/null | grep -q "Mach-O"; then
        codesign --force --options runtime --entitlements build/entitlements.mac.plist --sign "$CSC_NAME" "$executable" 2>/dev/null || true
    fi
done

# Sign the main app with hardened runtime
codesign --force --deep --options runtime --entitlements build/entitlements.mac.plist --sign "$CSC_NAME" "$APP_PATH"

# Verify app code signature
echo -e "${YELLOW}🔍 Verifying app code signature...${NC}"
if codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1; then
    echo -e "${GREEN}✅ App code signature verified${NC}"
    # Verify hardened runtime
    if codesign -dvvv "$APP_PATH" 2>&1 | grep -q "flags=.*runtime"; then
        echo -e "${GREEN}✅ Hardened runtime verified${NC}"
    else
        echo -e "${RED}❌ Hardened runtime not enabled${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ App code signature verification failed${NC}"
    exit 1
fi

# Re-create DMG with properly signed app (electron-builder's DMG loses hardened runtime)
if [ -n "$DMG_PATH" ]; then
    echo -e "${YELLOW}🔄 Re-creating DMG with signed app and installer layout...${NC}"
    
    # Store original DMG path and create new path
    ORIGINAL_DMG="$DMG_PATH"
    FINAL_DMG="${DMG_PATH%.dmg}-signed.dmg"
    TEMP_DIR="dist/dmg-temp"
    TEMP_DMG="dist/temp.dmg"
    
    # Remove old files if exist
    rm -f "$FINAL_DMG"
    rm -f "$TEMP_DMG"
    
    # Create temporary directory for DMG contents
    rm -rf "$TEMP_DIR"
    mkdir -p "$TEMP_DIR"
    
    # Copy the signed app to temp directory
    echo "  Copying signed app to temp directory..."
    cp -R "$APP_PATH" "$TEMP_DIR/"
    
    # Create symlink to Applications folder
    echo "  Creating Applications folder link..."
    ln -s /Applications "$TEMP_DIR/Applications"
    
    # Create a temporary DMG
    echo "  Creating DMG with installer layout..."
    hdiutil create -volname "Viber" \
        -srcfolder "$TEMP_DIR" \
        -ov -format UDRW \
        "$TEMP_DMG"
    
    # Mount the temporary DMG
    echo "  Mounting temporary DMG..."
    MOUNT_POINT=$(hdiutil attach -nobrowse "$TEMP_DMG" | grep "/Volumes" | awk '{print $3}')
    
    # Set custom icon positions and window properties using AppleScript
    echo "  Setting DMG window properties..."
    osascript <<EOF
tell application "Finder"
    tell disk "Viber"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {400, 100, 900, 400}
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 72
        set background picture of viewOptions to POSIX file "/System/Library/CoreServices/Finder.app/Contents/Resources/Finder.icns"
        set position of item "Viber.app" of container window to {125, 150}
        set position of item "Applications" of container window to {375, 150}
        close
        open
        update without registering applications
        delay 2
    end tell
end tell
EOF
    
    # Unmount the DMG
    echo "  Unmounting temporary DMG..."
    hdiutil detach "$MOUNT_POINT" -quiet
    
    # Convert to compressed read-only DMG
    echo "  Converting to final DMG..."
    hdiutil convert "$TEMP_DMG" -format UDZO -o "$FINAL_DMG"
    
    # Sign the new DMG
    echo -e "${YELLOW}✍️  Signing DMG file...${NC}"
    if codesign --force --sign "$CSC_NAME" "$FINAL_DMG"; then
        echo -e "${GREEN}✅ DMG signed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to sign DMG${NC}"
        exit 1
    fi
    
    # Verify DMG signature
    echo -e "${YELLOW}🔍 Verifying DMG signature...${NC}"
    if codesign --verify --verbose=2 "$FINAL_DMG" 2>&1; then
        echo -e "${GREEN}✅ DMG signature verified${NC}"
    else
        echo -e "${RED}❌ DMG signature verification failed${NC}"
        exit 1
    fi
    
    # Clean up
    rm -rf "$TEMP_DIR"
    rm -f "$TEMP_DMG"
    rm -f "$ORIGINAL_DMG"  # Remove the original DMG from electron-builder
    
    # Update DMG_PATH to point to the new DMG
    DMG_PATH="$FINAL_DMG"
fi

# Notarize the DMG using keychain profile
if [ "$NOTARIZE_ENABLED" = true ] && [ -n "$DMG_PATH" ]; then
    echo -e "${BLUE}🏆 Starting notarization process...${NC}"
    echo "Submitting DMG for notarization..."
    
    if xcrun notarytool submit "$DMG_PATH" --keychain-profile "$APPLE_APP_SPECIFIC_PASSWORD_PROFILE" --wait; then
        echo -e "${GREEN}✅ Notarization successful${NC}"
        
        # Staple the notarization ticket to the DMG
        echo -e "${YELLOW}📎 Stapling notarization ticket...${NC}"
        if xcrun stapler staple "$DMG_PATH"; then
            echo -e "${GREEN}✅ Notarization ticket stapled${NC}"
        else
            echo -e "${RED}❌ Failed to staple notarization ticket${NC}"
        fi
    else
        echo -e "${RED}❌ Notarization failed${NC}"
        echo "You can check the notarization log for details"
    fi
    
    # Verify notarization
    echo -e "${YELLOW}🔍 Verifying notarization...${NC}"
    if spctl -a -t open --context context:primary-signature -v "$DMG_PATH" 2>&1 | grep -q "accepted"; then
        echo -e "${GREEN}✅ DMG notarization verified${NC}"
    else
        echo -e "${YELLOW}⚠️  DMG notarization not verified${NC}"
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

# Calculate and display SHA256 for Homebrew
if [ -n "$DMG_PATH" ] && [ -f "$DMG_PATH" ]; then
    echo ""
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}🍺 Homebrew Distribution Info${NC}"
    echo -e "${BLUE}=========================================${NC}"
    
    DMG_SHA256=$(shasum -a 256 "$DMG_PATH" | awk '{print $1}')
    DMG_FILENAME=$(basename "$DMG_PATH")
    
    echo -e "${YELLOW}📋 Copy this for your Homebrew formula:${NC}"
    echo ""
    echo "  url \"https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/vX.X.X/$DMG_FILENAME\""
    echo "  sha256 \"$DMG_SHA256\""
    echo ""
    echo -e "${GREEN}SHA256:${NC} $DMG_SHA256"
    echo -e "${GREEN}File:${NC} $DMG_FILENAME"
    echo ""
    echo -e "${YELLOW}Note:${NC} Replace the URL with your actual GitHub release URL"
fi