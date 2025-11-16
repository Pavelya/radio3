-- Migration 020: Lore fact tracking
-- Description: Track canonical facts for consistency checking

-- Canonical facts about the 2525 world
CREATE TABLE lore_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL, -- 'technology', 'location', 'species', 'organization', 'event', 'character'
  fact_key TEXT NOT NULL UNIQUE, -- e.g., 'mars_colony_population', 'warp_drive_speed'

  -- Fact details
  fact_value TEXT NOT NULL,
  fact_type TEXT NOT NULL CHECK (fact_type IN ('number', 'text', 'date', 'boolean')),

  -- Metadata
  description TEXT,
  source_document_id UUID, -- Optional reference to source document

  -- Constraints
  min_value NUMERIC, -- For number types
  max_value NUMERIC,
  allowed_values TEXT[], -- For enumerated types

  -- Version tracking
  version INT DEFAULT 1,
  superseded_by UUID REFERENCES lore_facts(id),

  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fact relationships (e.g., Mars Colony is part of Colonial Council)
CREATE TABLE lore_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_fact_id UUID REFERENCES lore_facts(id) ON DELETE CASCADE,
  child_fact_id UUID REFERENCES lore_facts(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- 'part_of', 'located_at', 'reports_to', 'predecessor', etc.

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(parent_fact_id, child_fact_id, relationship_type)
);

-- Contradiction detection log
CREATE TABLE lore_contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID REFERENCES segments(id),

  -- Contradiction details
  fact_key TEXT NOT NULL,
  canonical_value TEXT NOT NULL,
  contradictory_value TEXT NOT NULL,
  context_text TEXT, -- Where in script this appears

  -- Resolution
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'major')),
  resolved BOOLEAN DEFAULT false,
  resolution_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_lore_facts_category ON lore_facts(category);
CREATE INDEX idx_lore_facts_active ON lore_facts(active) WHERE active = true;
CREATE INDEX idx_lore_relationships_parent ON lore_relationships(parent_fact_id);
CREATE INDEX idx_lore_relationships_child ON lore_relationships(child_fact_id);
CREATE INDEX idx_lore_contradictions_segment ON lore_contradictions(segment_id);
CREATE INDEX idx_lore_contradictions_unresolved ON lore_contradictions(resolved) WHERE resolved = false;

-- Seed canonical facts
INSERT INTO lore_facts (category, fact_key, fact_value, fact_type, description) VALUES
  ('technology', 'warp_drive_max_speed', '10', 'number', 'Maximum warp factor for civilian vessels'),
  ('technology', 'ftl_travel_method', 'warp drive', 'text', 'Primary faster-than-light travel method'),
  ('location', 'mars_colony_founding', '2087', 'date', 'Year Mars Colony was permanently established'),
  ('location', 'earth_government', 'United Earth', 'text', 'Official name of Earth''s governing body'),
  ('organization', 'colonial_council', 'Colonial Council', 'text', 'Governing body for off-Earth colonies'),
  ('species', 'centaurian_homeworld', 'Proxima Centauri b', 'text', 'Homeworld of Centaurian species'),
  ('species', 'known_intelligent_species', '7', 'number', 'Number of known intelligent alien species'),
  ('event', 'first_contact_year', '2247', 'date', 'Year of first contact with alien intelligence'),
  ('technology', 'fusion_reactor_type', 'tokamak fusion', 'text', 'Standard fusion reactor design'),
  ('location', 'titan_settlement_status', 'underwater domes', 'text', 'Titan settlements are underwater in methane seas');

COMMENT ON TABLE lore_facts IS 'Canonical facts about the 2525 world for consistency checking';
COMMENT ON TABLE lore_contradictions IS 'Detected contradictions in generated content';
