#!/bin/bash
# Test multi-speaker conversation generation

SEGMENT_ID="${1}"

if [ -z "$SEGMENT_ID" ]; then
  echo "Usage: test-conversation.sh <segment-id>"
  exit 1
fi

echo "🎙️  Testing Multi-Speaker Conversation"
echo "Segment ID: $SEGMENT_ID"
echo "=================================================="

# Check segment exists
echo ""
echo "Segment Details:"
psql $DATABASE_URL -c "SELECT id, conversation_format, state, slot_type FROM segments WHERE id='$SEGMENT_ID';"

# Check participants
echo ""
echo "Participants:"
psql $DATABASE_URL -c "
SELECT
  cp.role,
  COALESCE(cp.character_name, d.name) as name,
  d.voice_id
FROM conversation_participants cp
JOIN djs d ON cp.dj_id = d.id
WHERE cp.segment_id='$SEGMENT_ID'
ORDER BY cp.speaking_order;
"

# Check turns
echo ""
echo "Conversation Turns:"
psql $DATABASE_URL -c "
SELECT
  turn_number,
  speaker_name,
  LENGTH(text_content) as text_length,
  ROUND(duration_sec::numeric, 1) as duration,
  CASE WHEN audio_path IS NOT NULL THEN '✓' ELSE '✗' END as has_audio
FROM conversation_turns
WHERE segment_id='$SEGMENT_ID'
ORDER BY turn_number;
"

# Check final audio
echo ""
echo "Final Audio Asset:"
psql $DATABASE_URL -c "
SELECT
  a.storage_path,
  ROUND(a.duration_sec::numeric, 1) as duration,
  a.format,
  a.validation_status
FROM segments s
LEFT JOIN assets a ON s.asset_id = a.id
WHERE s.id='$SEGMENT_ID';
"

# Calculate total duration
echo ""
echo "Duration Summary:"
psql $DATABASE_URL -c "
SELECT
  COUNT(*) as total_turns,
  ROUND(SUM(duration_sec)::numeric, 1) as total_turn_duration,
  ROUND(AVG(duration_sec)::numeric, 1) as avg_turn_duration
FROM conversation_turns
WHERE segment_id='$SEGMENT_ID'
AND duration_sec IS NOT NULL;
"

echo ""
echo "✅ Test complete"
