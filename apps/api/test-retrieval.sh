#!/bin/bash
# Simple smoke test for RAG retrieval endpoint

echo "Testing RAG retrieval endpoint..."

# Test with a simple query
curl -X POST http://localhost:8000/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "text": "climate change technology",
    "topK": 5,
    "recency_boost": true
  }' \
  -w "\nHTTP Status: %{http_code}\n"

echo ""
echo "Test with empty query (should return 400)..."

curl -X POST http://localhost:8000/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "text": ""
  }' \
  -w "\nHTTP Status: %{http_code}\n"
