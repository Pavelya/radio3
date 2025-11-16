-- Migration 021 Down: Remove tone analytics tables
-- Purpose: Rollback tone analytics tracking

DROP TABLE IF EXISTS tone_history;
DROP TABLE IF EXISTS tone_metrics_daily;
