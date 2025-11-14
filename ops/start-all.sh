#!/bin/bash
#
# AI Radio 2525 - Start All Services
#
# This script starts all required services for the radio station.
# Services are started in the correct dependency order.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=================================================="
echo "  AI Radio 2525 - Starting All Services"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install Docker.${NC}"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ pnpm not found. Please install pnpm.${NC}"
    exit 1
fi

if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Using defaults.${NC}"
fi

echo -e "${GREEN}✅ Prerequisites OK${NC}"
echo ""

# Step 1: Start Docker services
echo "🐳 Step 1/4: Starting Docker services..."
echo ""

cd "$PROJECT_ROOT"

echo "  → Starting Piper TTS (port 5002)..."
docker compose up -d piper-tts
sleep 2

echo "  → Starting Icecast + Liquidsoap + Cache Cleanup (port 8001)..."
cd "$PROJECT_ROOT/apps/playout"
docker compose up -d
sleep 3

cd "$PROJECT_ROOT"

# Check Docker services
echo ""
echo "  Docker services status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep radio || echo -e "${RED}  No radio containers running${NC}"
echo ""

# Step 2: Start API Server
echo "🚀 Step 2/4: Starting API Server (port 8000)..."
echo ""

# Check if API is already running
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}  ⚠️  Port 8000 already in use. Skipping API start.${NC}"
else
    echo "  → Starting API in background..."
    cd "$PROJECT_ROOT"

    # Create logs directory
    mkdir -p logs

    # Start API in background, redirect output to log file
    nohup pnpm --filter @radio/api dev > logs/api.log 2>&1 &
    API_PID=$!
    echo "  API PID: $API_PID"

    # Wait for API to be ready
    echo -n "  Waiting for API to start"
    for i in {1..30}; do
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            echo -e " ${GREEN}✓${NC}"
            break
        fi
        echo -n "."
        sleep 1
    done
fi

echo ""

# Step 3: Start Workers
echo "⚙️  Step 3/4: Starting Workers..."
echo ""

# Scheduler Worker
if pgrep -f "scheduler-worker.*start" > /dev/null; then
    echo -e "${YELLOW}  ⚠️  Scheduler worker already running${NC}"
else
    echo "  → Starting Scheduler Worker..."
    nohup pnpm --filter @radio/scheduler-worker start > logs/scheduler.log 2>&1 &
    echo "  Scheduler PID: $!"
fi

# Segment Gen Workers
SEGMENT_GEN_COUNT=$(pgrep -f "segment-gen-worker.*start" | wc -l)
if [ "$SEGMENT_GEN_COUNT" -ge 1 ]; then
    echo -e "${YELLOW}  ⚠️  Segment Gen workers already running ($SEGMENT_GEN_COUNT)${NC}"
else
    echo "  → Starting Segment Gen Worker..."
    nohup pnpm --filter @radio/segment-gen-worker start > logs/segment-gen.log 2>&1 &
    echo "  Segment Gen PID: $!"
fi

# Embedder Workers
EMBEDDER_COUNT=$(pgrep -f "embedder-worker.*start" | wc -l)
if [ "$EMBEDDER_COUNT" -ge 1 ]; then
    echo -e "${YELLOW}  ⚠️  Embedder workers already running ($EMBEDDER_COUNT)${NC}"
else
    echo "  → Starting Embedder Worker..."
    nohup pnpm --filter @radio/embedder-worker start > logs/embedder.log 2>&1 &
    echo "  Embedder PID: $!"
fi

# Mastering Workers
MASTERING_COUNT=$(pgrep -f "mastering-worker.*start" | wc -l)
if [ "$MASTERING_COUNT" -ge 1 ]; then
    echo -e "${YELLOW}  ⚠️  Mastering workers already running ($MASTERING_COUNT)${NC}"
else
    echo "  → Starting Mastering Worker..."
    nohup pnpm --filter @radio/mastering-worker start > logs/mastering.log 2>&1 &
    echo "  Mastering PID: $!"
fi

sleep 2
echo ""

# Step 4: Start Web Interfaces (optional - usually run manually in dev)
echo "🌐 Step 4/4: Web Interfaces..."
echo ""
echo -e "${YELLOW}  ℹ️  Web interfaces (Admin/Public Player) should be started manually:${NC}"
echo ""
echo "    Terminal 1: pnpm --filter @radio/admin dev"
echo "    Terminal 2: pnpm --filter @radio/web dev"
echo ""

# Summary
echo "=================================================="
echo "  ✅ Startup Complete!"
echo "=================================================="
echo ""
echo "Services Status:"
echo "  🐳 Docker Services:"
docker ps --format "     {{.Names}}: {{.Status}}" | grep radio || echo "     None running"
echo ""
echo "  🧹 Cache Cleanup:"
docker ps --filter "name=radio-cache-cleanup" --format "     Cache Cleanup: {{.Status}}" || echo "     Cache Cleanup: Not running"
echo "     - Playout cache: 24h retention"
echo "     - TTS cache: 48h retention (runs hourly)"
echo ""
echo "  📡 API & Workers:"
lsof -i :8000 -sTCP:LISTEN -t >/dev/null 2>&1 && echo "     API Server: Running (port 8000)" || echo "     API Server: Not running"
pgrep -f "scheduler-worker" > /dev/null && echo "     Scheduler Worker: Running" || echo "     Scheduler Worker: Not running"
pgrep -f "segment-gen-worker" > /dev/null && echo "     Segment Gen Worker: Running" || echo "     Segment Gen Worker: Not running"
pgrep -f "embedder-worker" > /dev/null && echo "     Embedder Worker: Running" || echo "     Embedder Worker: Not running"
pgrep -f "mastering-worker" > /dev/null && echo "     Mastering Worker: Running" || echo "     Mastering Worker: Not running"
echo ""
echo "URLs:"
echo "  Stream (Opus): http://localhost:8001/radio.opus"
echo "  Stream (MP3):  http://localhost:8001/radio.mp3"
echo "  Icecast Admin: http://localhost:8001/admin/ (admin/admin)"
echo "  API Health:    http://localhost:8000/health"
echo ""
echo "Logs:"
echo "  View logs: tail -f logs/*.log"
echo "  Docker logs: docker logs <container-name>"
echo ""
echo "To stop all services: ./ops/stop-all.sh"
echo ""
