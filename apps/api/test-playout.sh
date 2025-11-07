#!/bin/bash
# Test script for playout API endpoints
# Usage: ./test-playout.sh

API_URL="${API_URL:-http://localhost:8000}"

echo "Testing Playout API Endpoints"
echo "=============================="
echo ""

# Test 1: Health check
echo "1. Testing health endpoint..."
response=$(curl -s "${API_URL}/health")
echo "Response: ${response}"
echo ""

# Test 2: Get next segments
echo "2. Testing GET /playout/next?limit=5..."
response=$(curl -s "${API_URL}/playout/next?limit=5")
echo "Response: ${response}" | jq '.' 2>/dev/null || echo "${response}"
echo ""

# Test 3: Get next segments with different limit
echo "3. Testing GET /playout/next?limit=3..."
response=$(curl -s "${API_URL}/playout/next?limit=3")
echo "Response: ${response}" | jq '.' 2>/dev/null || echo "${response}"
echo ""

# Test 4: Test invalid limit (should cap at 50)
echo "4. Testing GET /playout/next?limit=100 (should cap at 50)..."
response=$(curl -s "${API_URL}/playout/next?limit=100")
echo "Response: ${response}" | jq '.' 2>/dev/null || echo "${response}"
echo ""

# Test 5: Report now-playing
echo "5. Testing POST /playout/now-playing..."
response=$(curl -s -X POST "${API_URL}/playout/now-playing" \
  -H "Content-Type: application/json" \
  -d '{
    "segment_id": "test-segment-id",
    "title": "Test Segment",
    "timestamp": "2525-01-01T12:00:00Z"
  }')
echo "Response: ${response}" | jq '.' 2>/dev/null || echo "${response}"
echo ""

# Test 6: Mark segment complete
echo "6. Testing POST /playout/segment-complete/test-id..."
response=$(curl -s -X POST "${API_URL}/playout/segment-complete/test-id")
echo "Response: ${response}" | jq '.' 2>/dev/null || echo "${response}"
echo ""

# Test 7: Test with missing fields
echo "7. Testing POST /playout/now-playing with missing fields (should fail)..."
response=$(curl -s -X POST "${API_URL}/playout/now-playing" \
  -H "Content-Type: application/json" \
  -d '{"segment_id": "test"}')
echo "Response: ${response}" | jq '.' 2>/dev/null || echo "${response}"
echo ""

echo "=============================="
echo "Tests complete!"
echo ""
echo "Note: Some tests may return 404 errors if test data doesn't exist."
echo "This is expected behavior for a working API."
