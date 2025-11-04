-- Rollback: Drop format clocks tables

DROP TRIGGER IF EXISTS format_slots_updated_at ON format_slots;
DROP TRIGGER IF EXISTS format_clocks_updated_at ON format_clocks;
DROP TABLE IF EXISTS format_slots;
DROP TABLE IF EXISTS format_clocks;
