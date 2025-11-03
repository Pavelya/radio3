-- Migration: Enable pgvector extension
-- Description: Required for vector similarity search in RAG system
-- Author: AI Radio Team
-- Date: 2025-01-01

CREATE EXTENSION IF NOT EXISTS vector;

COMMENT ON EXTENSION vector IS 'Vector similarity search for RAG';
