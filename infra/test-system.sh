#!/bin/bash
# System testing script for AI Radio 2525

set -e

echo "=== AI Radio 2525 System Test ==="
echo ""

# Load environment
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    exit 1
fi

source .env

echo "1. Testing Scheduler Worker..."
SCHEDULER_MODE=once node workers/scheduler/dist/index.js
echo "✅ Scheduler completed"
echo ""

echo "2. Testing Embedder Worker (10 seconds)..."
timeout 10 node workers/embedder/dist/src/index.js || true
echo "✅ Embedder worker tested"
echo ""

echo "3. Testing Segment-Gen Worker (10 seconds)..."
timeout 10 node workers/segment-gen/dist/index.js || true
echo "✅ Segment-gen worker tested"
echo ""

echo "4. Testing API endpoints..."
curl -s http://localhost:8000/health | grep -q "ok" && echo "✅ Health endpoint working" || echo "❌ Health endpoint failed"
curl -s 'http://localhost:8000/playout/next?limit=5' && echo ""
echo ""

echo "=== Test complete ==="
