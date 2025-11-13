#!/bin/bash
#
# AI Radio 2525 - Stop All Services
#
# This script stops all running services for the radio station.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=================================================="
echo "  AI Radio 2525 - Stopping All Services"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Stop Node.js processes
echo "🛑 Step 1/2: Stopping Node.js services..."
echo ""

# Find and kill all radio-related node processes
PIDS=$(pgrep -f "pnpm.*@radio" || true)
if [ -n "$PIDS" ]; then
    echo "  → Stopping pnpm processes..."
    echo "$PIDS" | while read pid; do
        CMD=$(ps -p $pid -o command= 2>/dev/null || echo "unknown")
        echo "    Killing PID $pid: $CMD"
        kill $pid 2>/dev/null || true
    done
    sleep 2

    # Force kill if still running
    PIDS=$(pgrep -f "pnpm.*@radio" || true)
    if [ -n "$PIDS" ]; then
        echo "  → Force killing remaining processes..."
        kill -9 $PIDS 2>/dev/null || true
    fi
else
    echo -e "${YELLOW}  ℹ️  No pnpm processes found${NC}"
fi

# Kill worker processes
WORKER_PIDS=$(pgrep -f "node.*dist.*(scheduler|segment-gen|embedder|mastering)" || true)
if [ -n "$WORKER_PIDS" ]; then
    echo "  → Stopping worker processes..."
    echo "$WORKER_PIDS" | while read pid; do
        kill $pid 2>/dev/null || true
    done
    sleep 1
else
    echo -e "${YELLOW}  ℹ️  No worker processes found${NC}"
fi

# Kill API server
API_PIDS=$(pgrep -f "tsx.*server.ts" || true)
if [ -n "$API_PIDS" ]; then
    echo "  → Stopping API server..."
    echo "$API_PIDS" | while read pid; do
        kill $pid 2>/dev/null || true
    done
    sleep 1
else
    echo -e "${YELLOW}  ℹ️  No API server processes found${NC}"
fi

echo -e "${GREEN}✅ Node.js services stopped${NC}"
echo ""

# Step 2: Stop Docker services
echo "🐳 Step 2/2: Stopping Docker services..."
echo ""

cd "$PROJECT_ROOT"

# Stop playout services (Icecast + Liquidsoap)
if [ -f "$PROJECT_ROOT/apps/playout/docker-compose.yml" ]; then
    echo "  → Stopping Icecast + Liquidsoap..."
    cd "$PROJECT_ROOT/apps/playout"
    docker compose down 2>&1 | grep -v "no configuration file provided" || true
    cd "$PROJECT_ROOT"
fi

# Stop Piper TTS
if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    echo "  → Stopping Piper TTS..."
    docker compose down 2>&1 | grep -v "no configuration file provided" || true
fi

# Check for any remaining radio containers
CONTAINERS=$(docker ps -q --filter "name=radio-" || true)
if [ -n "$CONTAINERS" ]; then
    echo "  → Stopping remaining radio containers..."
    docker stop $CONTAINERS 2>/dev/null || true
fi

echo -e "${GREEN}✅ Docker services stopped${NC}"
echo ""

# Verify everything is stopped
echo "=================================================="
echo "  🔍 Verifying shutdown..."
echo "=================================================="
echo ""

# Check for remaining processes
echo "Checking for remaining processes:"
REMAINING_PROCS=$(ps aux | grep -E "pnpm|tsx|node.*dist" | grep -v grep | grep -v stop-all || true)
if [ -n "$REMAINING_PROCS" ]; then
    echo -e "${YELLOW}⚠️  Some processes still running:${NC}"
    echo "$REMAINING_PROCS"
    echo ""
    echo "To force kill all:"
    echo "  pkill -9 -f pnpm"
    echo "  pkill -9 -f tsx"
    echo "  pkill -9 -f 'node.*dist'"
else
    echo -e "${GREEN}✓ No Node.js processes running${NC}"
fi

# Check Docker
DOCKER_RUNNING=$(docker ps --filter "name=radio-" --format "{{.Names}}" || true)
if [ -n "$DOCKER_RUNNING" ]; then
    echo -e "${YELLOW}⚠️  Some Docker containers still running:${NC}"
    echo "$DOCKER_RUNNING"
    echo ""
    echo "To force stop:"
    echo "  docker stop $DOCKER_RUNNING"
else
    echo -e "${GREEN}✓ No Docker containers running${NC}"
fi

# Check ports
echo ""
echo "Checking ports:"
PORT_CHECK=true
for port in 3000 3001 8000 8001 5002; do
    if lsof -i :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}  Port $port: In use${NC}"
        PORT_CHECK=false
    else
        echo -e "${GREEN}  Port $port: Free${NC}"
    fi
done

echo ""
if [ "$PORT_CHECK" = true ]; then
    echo "=================================================="
    echo -e "  ${GREEN}✅ All services stopped successfully!${NC}"
    echo "=================================================="
else
    echo "=================================================="
    echo -e "  ${YELLOW}⚠️  Some ports still in use${NC}"
    echo "=================================================="
    echo ""
    echo "Check what's using ports:"
    echo "  lsof -i :8000"
fi
echo ""
echo "To start services again: ./ops/start-all.sh"
echo ""
