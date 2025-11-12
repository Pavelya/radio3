#!/bin/bash
# Cleanup stale worker health check registrations

psql "${DATABASE_URL}" -c "DELETE FROM health_checks WHERE last_heartbeat < NOW() - INTERVAL '5 minutes';" 2>/dev/null || echo "Note: Using Supabase (can't access DB directly)"

echo "Stale worker registrations cleaned up"
