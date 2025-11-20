#!/bin/bash
# Script to analyze Supabase storage usage
# Shows database table sizes and identifies optimization opportunities

set -e

# Load environment
if [ -f .env ]; then
  source .env
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set"
  exit 1
fi

echo "==================================================="
echo "📊 SUPABASE STORAGE ANALYSIS"
echo "==================================================="
echo ""

echo "📦 DATABASE TABLE SIZES"
echo "---------------------------------------------------"
psql "$DATABASE_URL" -c "
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;
" || echo "Failed to query table sizes"

echo ""
echo "📈 ROW COUNTS FOR KEY TABLES"
echo "---------------------------------------------------"

# Segments
SEGMENT_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM segments;" | xargs)
echo "Segments: $SEGMENT_COUNT rows"

# Assets
ASSET_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM assets;" | xargs)
echo "Assets: $ASSET_COUNT rows"

# KB tables
KB_CHUNKS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM kb_chunks;" | xargs)
echo "KB Chunks: $KB_CHUNKS rows"

KB_EMBEDDINGS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM kb_embeddings;" | xargs)
echo "KB Embeddings: $KB_EMBEDDINGS rows"

# Music
MUSIC_TRACKS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM music_tracks;" | xargs)
echo "Music Tracks: $MUSIC_TRACKS rows"

JINGLES=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM jingles;" | xargs)
echo "Jingles: $JINGLES rows"

echo ""
echo "🎵 MUSIC LIBRARY STORAGE"
echo "---------------------------------------------------"
psql "$DATABASE_URL" -c "
SELECT
  COUNT(*) AS count,
  pg_size_pretty(SUM(LENGTH(storage_path)::bigint)) AS path_metadata,
  ROUND(AVG(duration_sec)::numeric, 1) AS avg_duration_sec
FROM music_tracks
WHERE active = true;
" || echo "Failed to query music library"

echo ""
echo "🎤 SEGMENT STATE BREAKDOWN"
echo "---------------------------------------------------"
psql "$DATABASE_URL" -c "
SELECT
  state,
  COUNT(*) AS count,
  ROUND(AVG(duration_sec)::numeric, 1) AS avg_duration
FROM segments
GROUP BY state
ORDER BY count DESC;
" || echo "Failed to query segment states"

echo ""
echo "🗄️ ASSETS BY CONTENT TYPE"
echo "---------------------------------------------------"
psql "$DATABASE_URL" -c "
SELECT
  content_type,
  COUNT(*) AS count,
  validation_status,
  COUNT(CASE WHEN lufs_integrated IS NOT NULL THEN 1 END) AS normalized_count
FROM assets
GROUP BY content_type, validation_status
ORDER BY count DESC;
" || echo "Failed to query assets"

echo ""
echo "🔍 DUPLICATE ASSET DETECTION"
echo "---------------------------------------------------"
psql "$DATABASE_URL" -c "
SELECT
  content_hash,
  COUNT(*) AS duplicate_count,
  STRING_AGG(id::text, ', ') AS asset_ids
FROM assets
WHERE content_hash IS NOT NULL
GROUP BY content_hash
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 10;
" || echo "No duplicate assets found or query failed"

echo ""
echo "🧠 KNOWLEDGE BASE VECTOR STORAGE"
echo "---------------------------------------------------"
psql "$DATABASE_URL" -c "
SELECT
  'kb_embeddings' AS table,
  COUNT(*) AS vector_count,
  pg_size_pretty(pg_total_relation_size('kb_embeddings')) AS total_size,
  pg_size_pretty(pg_relation_size('kb_embeddings')) AS data_size,
  pg_size_pretty(pg_indexes_size('kb_embeddings')) AS index_size
FROM kb_embeddings;
" || echo "Failed to query embeddings"

echo ""
echo "🗑️ OLD SEGMENTS (Potential for Cleanup)"
echo "---------------------------------------------------"
psql "$DATABASE_URL" -c "
SELECT
  state,
  COUNT(*) AS count,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM segments
WHERE created_at < NOW() - INTERVAL '30 days'
GROUP BY state
ORDER BY count DESC;
" || echo "No old segments or query failed"

echo ""
echo "📊 ARCHIVED/AIRED SEGMENTS"
echo "---------------------------------------------------"
psql "$DATABASE_URL" -c "
SELECT
  COUNT(*) AS count,
  MIN(aired_at) AS oldest_aired,
  MAX(aired_at) AS newest_aired
FROM segments
WHERE state IN ('aired', 'archived');
" || echo "Failed to query aired segments"

echo ""
echo "==================================================="
echo "✅ ANALYSIS COMPLETE"
echo "==================================================="
