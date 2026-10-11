#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
REPO_DIR="${SCRIPT_DIR:h}"
BUILD_DIR="$REPO_DIR/build"
APP_NAME="HarnessCascade"
APP_DIR="$BUILD_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
SDK_PATH="$(xcrun --show-sdk-path)"

echo "==> Baue $APP_NAME.app…"
mkdir -p "$BUILD_DIR" "$MACOS_DIR" "$RESOURCES_DIR"

# 1. Info.plist kopieren
echo "==> Erstelle Info.plist…"
cp "$SCRIPT_DIR/Resources/Info.plist" "$CONTENTS_DIR/Info.plist"

# 2. App-Icon aus SVG generieren
echo "==> Generiere AppIcon.icns aus public/icon.svg…"
swift "$SCRIPT_DIR/generate-icon.swift" "$REPO_DIR/public/icon.svg" "$RESOURCES_DIR/AppIcon.icns"

# 3. Server- und Web-Dateien in das Bundle einbetten (eigenständige App)
STANDALONE=true
if [[ "${1:-}" == "--dev" ]]; then
    STANDALONE=false
fi

if [[ "$STANDALONE" == true ]]; then
    echo "==> Bündle Server-Laufzeit in Contents/Resources/app…"
    APP_BUNDLE_DEST="$RESOURCES_DIR/app"
    mkdir -p "$APP_BUNDLE_DEST"
    rsync -a --delete \
        --exclude='.beads' \
        --exclude='.git' \
        --exclude='.workbuddy-ai' \
        --exclude='.qoder' \
        --exclude='.freebuff' \
        --exclude='build' \
        --exclude='mac-app' \
        --exclude='Archiv' \
        "$REPO_DIR/" "$APP_BUNDLE_DEST/"
fi

# 4. Swift-Quellcode kompilieren
echo "==> Kompiliere Swift-Quellen mit swiftc…"
swiftc \
    -sdk "$SDK_PATH" \
    -target arm64-apple-macos14.0 \
    -framework AppKit \
    -framework WebKit \
    -O \
    "$SCRIPT_DIR/Sources/ServerManager.swift" \
    "$SCRIPT_DIR/Sources/MainWindowController.swift" \
    "$SCRIPT_DIR/Sources/MenuBuilder.swift" \
    "$SCRIPT_DIR/Sources/AppDelegate.swift" \
    "$SCRIPT_DIR/Sources/main.swift" \
    -o "$MACOS_DIR/HarnessRouter"

# 5. Ad-Hoc Signieren
echo "==> Signiere Bundle ad-hoc…"
codesign --force --deep --sign - "$APP_DIR"

echo "==> Erfolgreich gebaut: $APP_DIR"

# 6. Optional: Nach /Applications installieren
if [[ "${1:-}" == "--install" || "${2:-}" == "--install" ]]; then
    echo "==> Installiere nach /Applications/$APP_NAME.app…"
    rm -rf "/Applications/$APP_NAME.app"
    cp -R "$APP_DIR" "/Applications/$APP_NAME.app"
    echo "==> Installiert in /Applications/$APP_NAME.app"
fi
