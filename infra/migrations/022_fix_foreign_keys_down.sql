-- Migration 022 Down: Remove foreign key constraints
-- Purpose: Rollback foreign key constraint fixes

-- This is intentionally a no-op since we don't want to remove
-- foreign key constraints that should exist
SELECT 1;
