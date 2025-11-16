-- Migration 020 Rollback: Remove lore fact tracking tables

DROP TABLE IF EXISTS lore_contradictions;
DROP TABLE IF EXISTS lore_relationships;
DROP TABLE IF EXISTS lore_facts;
