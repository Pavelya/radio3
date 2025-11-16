-- Migration 021: Tone analytics tracking
-- Purpose: Historical tone metrics for monitoring and trend analysis

-- Daily tone metrics aggregation
CREATE TABLE tone_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,

  -- Aggregate metrics
  segments_analyzed INT DEFAULT 0,
  avg_tone_score NUMERIC(5,2),
  avg_optimism_pct NUMERIC(5,2),
  avg_realism_pct NUMERIC(5,2),
  avg_wonder_pct NUMERIC(5,2),

  -- Issue counts
  dystopian_flags INT DEFAULT 0,
  fantasy_flags INT DEFAULT 0,
  anachronism_flags INT DEFAULT 0,
  major_contradictions INT DEFAULT 0,

  -- Quality metrics
  segments_below_threshold INT DEFAULT 0, -- Score < 70

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-segment tone history (for detailed trending)
CREATE TABLE tone_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID REFERENCES segments(id) ON DELETE CASCADE,

  tone_score INT,
  optimism_pct INT,
  realism_pct INT,
  wonder_pct INT,

  issue_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_tone_metrics_date ON tone_metrics_daily(date DESC);
CREATE INDEX idx_tone_history_segment ON tone_history(segment_id);
CREATE INDEX idx_tone_history_created ON tone_history(created_at DESC);

-- Comments
COMMENT ON TABLE tone_metrics_daily IS 'Daily aggregated tone metrics for monitoring dashboard';
COMMENT ON TABLE tone_history IS 'Per-segment tone tracking for trend analysis';
COMMENT ON COLUMN tone_metrics_daily.segments_below_threshold IS 'Count of segments with tone_score < 70';
