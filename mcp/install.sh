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
else
  FILENAME="${BIN_NAME}-${PLATFORM}-${ARCH_TAG}"
fi

URL="${BASE_URL}/${FILENAME}"

mkdir -p "$INSTALL_DIR"

echo "Downloading ${BIN_NAME} for ${PLATFORM}/${ARCH_TAG}..."
curl -fSL "$URL" -o "${INSTALL_DIR}/${BIN_NAME}"
chmod +x "${INSTALL_DIR}/${BIN_NAME}"

if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
  echo ""
  echo "Add ${INSTALL_DIR} to your PATH:"
  echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  echo ""
fi

echo "Installed ${BIN_NAME} to ${INSTALL_DIR}/${BIN_NAME}"
