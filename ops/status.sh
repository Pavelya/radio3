#!/bin/bash
#
# AI Radio 2525 - Status Check
#
# Quick status check of all services
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=================================================="
echo "  AI Radio 2525 - Service Status"
echo "=================================================="
echo ""

# Function to check if service is running
check_service() {
    local name=$1
    local check_cmd=$2

    if eval "$check_cmd" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name"
        return 0
    else
        echo -e "${RED}✗${NC} $name"
        return 1
    fi
}

# Function to check port
check_port() {
    local name=$1
    local port=$2

    if lsof -i :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        local pid=$(lsof -i :$port -sTCP:LISTEN -t)
        echo -e "${GREEN}✓${NC} $name (port $port, PID: $pid)"
        return 0
    else
        echo -e "${RED}✗${NC} $name (port $port)"
        return 1
    fi
}

# Docker Services
echo -e "${BLUE}🐳 Docker Services${NC}"
echo "───────────────────────────────────────────────"
check_service "Piper TTS" "docker ps | grep -q radio-piper-tts"
check_service "Icecast" "docker ps | grep -q radio-icecast"
check_service "Liquidsoap" "docker ps | grep -q radio-liquidsoap"
check_service "Monitor" "docker ps | grep -q radio-monitor"
echo ""

# API & Web
echo -e "${BLUE}🌐 Web Services${NC}"
echo "───────────────────────────────────────────────"
check_port "API Server" 8000
check_port "Admin Dashboard" 3001
check_port "Public Player" 3000
check_port "Icecast Stream" 8001
check_port "Piper TTS" 5002
echo ""

# Workers
echo -e "${BLUE}⚙️  Workers${NC}"
echo "───────────────────────────────────────────────"
check_service "Scheduler Worker" "pgrep -f scheduler-worker"
check_service "Segment Gen Worker" "pgrep -f segment-gen-worker"
check_service "Embedder Worker" "pgrep -f embedder-worker"
check_service "Mastering Worker" "pgrep -f mastering-worker"
echo ""

# Health Checks
echo -e "${BLUE}🏥 Health Checks${NC}"
echo "───────────────────────────────────────────────"

# API Health
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} API Health: $(curl -s http://localhost:8000/health)"
else
    echo -e "${RED}✗${NC} API Health: Unreachable"
fi

# Piper TTS Health
if curl -s http://localhost:5002/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Piper TTS Health: OK"
else
    echo -e "${RED}✗${NC} Piper TTS Health: Unreachable"
fi

# Stream Check
if curl -s -I http://localhost:8001/radio.opus 2>&1 | grep -q "200 OK"; then
    echo -e "${GREEN}✓${NC} Stream (Opus): Available"
else
    echo -e "${RED}✗${NC} Stream (Opus): Unavailable"
fi

if curl -s -I http://localhost:8001/radio.mp3 2>&1 | grep -q "200 OK"; then
    echo -e "${GREEN}✓${NC} Stream (MP3): Available"
else
    echo -e "${RED}✗${NC} Stream (MP3): Unavailable"
fi

echo ""

# Process Counts
echo -e "${BLUE}📊 Process Counts${NC}"
echo "───────────────────────────────────────────────"
SCHEDULER_COUNT=$(pgrep -f scheduler-worker | wc -l | tr -d ' ')
SEGMENT_COUNT=$(pgrep -f segment-gen-worker | wc -l | tr -d ' ')
EMBEDDER_COUNT=$(pgrep -f embedder-worker | wc -l | tr -d ' ')
MASTERING_COUNT=$(pgrep -f mastering-worker | wc -l | tr -d ' ')

echo "Scheduler Workers:    $SCHEDULER_COUNT"
echo "Segment Gen Workers:  $SEGMENT_COUNT"
echo "Embedder Workers:     $EMBEDDER_COUNT"
echo "Mastering Workers:    $MASTERING_COUNT"
echo ""

# URLs
echo -e "${BLUE}🔗 Quick Links${NC}"
echo "───────────────────────────────────────────────"
echo "Public Player:  http://localhost:3000"
echo "Admin:          http://localhost:3001"
echo "API:            http://localhost:8000"
echo "Stream (Opus):  http://localhost:8001/radio.opus"
echo "Stream (MP3):   http://localhost:8001/radio.mp3"
echo "Icecast Admin:  http://localhost:8001/admin/"
echo ""

# Summary
echo "=================================================="
TOTAL_CHECKS=12
PASSED_CHECKS=0

docker ps | grep -q radio-piper-tts && PASSED_CHECKS=$((PASSED_CHECKS+1))
docker ps | grep -q radio-icecast && PASSED_CHECKS=$((PASSED_CHECKS+1))
docker ps | grep -q radio-liquidsoap && PASSED_CHECKS=$((PASSED_CHECKS+1))
lsof -i :8000 -sTCP:LISTEN -t >/dev/null 2>&1 && PASSED_CHECKS=$((PASSED_CHECKS+1))
lsof -i :8001 -sTCP:LISTEN -t >/dev/null 2>&1 && PASSED_CHECKS=$((PASSED_CHECKS+1))
pgrep -f scheduler-worker >/dev/null && PASSED_CHECKS=$((PASSED_CHECKS+1))
pgrep -f segment-gen-worker >/dev/null && PASSED_CHECKS=$((PASSED_CHECKS+1))
pgrep -f embedder-worker >/dev/null && PASSED_CHECKS=$((PASSED_CHECKS+1))
pgrep -f mastering-worker >/dev/null && PASSED_CHECKS=$((PASSED_CHECKS+1))
curl -s http://localhost:8000/health >/dev/null 2>&1 && PASSED_CHECKS=$((PASSED_CHECKS+1))
curl -s http://localhost:5002/health >/dev/null 2>&1 && PASSED_CHECKS=$((PASSED_CHECKS+1))
curl -s -I http://localhost:8001/radio.opus 2>&1 | grep -q "200 OK" && PASSED_CHECKS=$((PASSED_CHECKS+1))

if [ $PASSED_CHECKS -eq $TOTAL_CHECKS ]; then
    echo -e "  ${GREEN}✓ All services running ($PASSED_CHECKS/$TOTAL_CHECKS)${NC}"
elif [ $PASSED_CHECKS -gt 6 ]; then
    echo -e "  ${YELLOW}⚠ Partial operation ($PASSED_CHECKS/$TOTAL_CHECKS services)${NC}"
else
    echo -e "  ${RED}✗ System not operational ($PASSED_CHECKS/$TOTAL_CHECKS services)${NC}"
fi
echo "=================================================="
echo ""
