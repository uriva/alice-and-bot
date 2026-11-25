#!/bin/sh
set -e

BASE_URL="https://storage.googleapis.com/alice-and-bot/cli/dist"
INSTALL_DIR="$HOME/.local/bin"
BIN_NAME="alice-and-bot-mcp"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)  PLATFORM="linux" ;;
  Darwin) PLATFORM="darwin" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
  *) echo "Unsupported OS: $OS" && exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH_TAG="x64" ;;
  arm64|aarch64) ARCH_TAG="arm64" ;;
  *) echo "Unsupported architecture: $ARCH" && exit 1 ;;
esac

if [ "$PLATFORM" = "windows" ]; then
  FILENAME="${BIN_NAME}-${PLATFORM}-${ARCH_TAG}.exe"
  TARGET_NAME="${BIN_NAME}.exe"
else
  FILENAME="${BIN_NAME}-${PLATFORM}-${ARCH_TAG}"
  TARGET_NAME="${BIN_NAME}"
fi

URL="${BASE_URL}/${FILENAME}"
CHECKSUM_URL="${URL}.sha256"

mkdir -p "$INSTALL_DIR"
TMP_BIN="$(mktemp "${INSTALL_DIR}/.${TARGET_NAME}.XXXXXX")"
trap 'rm -f "$TMP_BIN"' EXIT

echo "Downloading ${BIN_NAME} for ${PLATFORM}/${ARCH_TAG}..."
curl -fSL "$URL" -o "$TMP_BIN"

EXPECTED_SHA="$(curl -fsSL "$CHECKSUM_URL" | tr -d '[:space:]')"
if [ -z "$EXPECTED_SHA" ]; then
  echo "Failed to fetch SHA-256 checksum from ${CHECKSUM_URL}" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_SHA="$(sha256sum "$TMP_BIN" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_SHA="$(shasum -a 256 "$TMP_BIN" | awk '{print $1}')"
else
  echo "Error: neither sha256sum nor shasum is installed to verify download integrity" >&2
  exit 1
fi

if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "Checksum mismatch! Expected ${EXPECTED_SHA}, got ${ACTUAL_SHA}" >&2
  exit 1
fi

chmod +x "$TMP_BIN"
mv "$TMP_BIN" "${INSTALL_DIR}/${TARGET_NAME}"
trap - EXIT

if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
  echo ""
  echo "Add ${INSTALL_DIR} to your PATH:"
  echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  echo ""
fi

echo "Installed ${TARGET_NAME} to ${INSTALL_DIR}/${TARGET_NAME}"
