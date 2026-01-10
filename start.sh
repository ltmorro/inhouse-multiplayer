#!/bin/bash
#
# Party Game Server - Easy Startup Script
# Just double-click this file or run: ./start.sh
#

set -e

# Colors for pretty output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}   Party Game Server - Starting Up${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to get local IP
get_local_ip() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1"
    else
        hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1"
    fi
}

# ============================================================================
# STEP 1: Check Prerequisites
# ============================================================================
echo -e "${BLUE}[1/5]${NC} Checking prerequisites..."

MISSING_DEPS=""

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node --version)
    echo -e "  ${GREEN}✓${NC} Node.js $NODE_VERSION"
else
    MISSING_DEPS="$MISSING_DEPS\n  - Node.js (https://nodejs.org)"
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm --version)
    echo -e "  ${GREEN}✓${NC} npm $NPM_VERSION"
else
    MISSING_DEPS="$MISSING_DEPS\n  - npm (comes with Node.js)"
fi

# Check Python
if command_exists python3; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "  ${GREEN}✓${NC} $PYTHON_VERSION"
elif command_exists python; then
    PYTHON_VERSION=$(python --version)
    echo -e "  ${GREEN}✓${NC} $PYTHON_VERSION"
else
    MISSING_DEPS="$MISSING_DEPS\n  - Python 3.10+ (https://python.org)"
fi

# Check uv
if command_exists uv; then
    UV_VERSION=$(uv --version 2>/dev/null || echo "installed")
    echo -e "  ${GREEN}✓${NC} uv $UV_VERSION"
else
    MISSING_DEPS="$MISSING_DEPS\n  - uv (run: curl -LsSf https://astral.sh/uv/install.sh | sh)"
fi

# Exit if missing dependencies
if [ -n "$MISSING_DEPS" ]; then
    echo ""
    echo -e "${RED}Missing required software:${NC}"
    echo -e "$MISSING_DEPS"
    echo ""
    echo "Please install the missing software and try again."
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

echo ""

# ============================================================================
# STEP 2: Load Environment Variables
# ============================================================================
echo -e "${BLUE}[2/5]${NC} Loading configuration..."

if [ -f ".env" ]; then
    echo -e "  ${GREEN}✓${NC} Found .env file, loading..."
    set -a
    source .env
    set +a
else
    echo -e "  ${YELLOW}!${NC} No .env file found (optional - using defaults)"
    echo "      Create .env from .env.example for WiFi QR codes & Spotify"
fi

echo ""

# ============================================================================
# STEP 3: Install Python Dependencies
# ============================================================================
echo -e "${BLUE}[3/5]${NC} Installing Python dependencies..."
uv sync
echo -e "  ${GREEN}✓${NC} Python dependencies installed"
echo ""

# ============================================================================
# STEP 4: Install & Build Frontend
# ============================================================================
echo -e "${BLUE}[4/5]${NC} Building frontend..."

# Check if node_modules exists, if not install
if [ ! -d "node_modules" ]; then
    echo "  Installing npm packages (first time setup)..."
    npm install
fi

# Always rebuild to ensure latest
npm run build
echo -e "  ${GREEN}✓${NC} Frontend built successfully"
echo ""

# ============================================================================
# STEP 5: Start the Server
# ============================================================================
echo -e "${BLUE}[5/5]${NC} Starting server..."
echo ""

LOCAL_IP=$(get_local_ip)
PORT="${PORT:-13370}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Server is starting!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  ${CYAN}TV Display:${NC}     http://$LOCAL_IP:$PORT/tv"
echo -e "  ${CYAN}Player Join:${NC}    http://$LOCAL_IP:$PORT/mobile"
echo -e "  ${CYAN}Admin Panel:${NC}    http://$LOCAL_IP:$PORT/admin"
echo ""
echo -e "  ${YELLOW}Admin Password:${NC} y2k2025"
echo ""
echo "  Players can scan the QR code on the TV to join!"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo ""

# Build command with optional WiFi args
CMD="uv run python app.py --port $PORT"

if [ -n "$WIFI_SSID" ] && [ -n "$WIFI_PASSWORD" ]; then
    echo -e "  ${GREEN}✓${NC} WiFi QR code enabled for: $WIFI_SSID"
    echo ""
fi

# Run the server
exec $CMD
