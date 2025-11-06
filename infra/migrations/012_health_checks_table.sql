-- Migration: Health checks table
-- Description: Worker heartbeat tracking

CREATE TABLE health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_type TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
  last_heartbeat TIMESTAMPTZ NOT NULL,
  metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(worker_type, instance_id)
);

CREATE INDEX idx_health_checks_worker ON health_checks(worker_type);
CREATE INDEX idx_health_checks_heartbeat ON health_checks(last_heartbeat DESC);

COMMENT ON TABLE health_checks IS 'Worker health status and heartbeat tracking';
