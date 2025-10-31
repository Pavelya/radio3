import { describe, it, expect } from 'vitest';
import {
  segmentSchema,
  universeDocSchema,
  eventSchema,
  djSchema,
  programSchema,
  assetSchema,
  jobSchema
} from '../src/schemas';

describe('Segment Schema', () => {
  it('should validate correct segment data', () => {
    const validSegment = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      program_id: '123e4567-e89b-12d3-a456-426614174001',
      slot_type: 'news',
      state: 'queued',
      lang: 'en',
      retry_count: 0,
      max_retries: 3,
      citations: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    expect(() => segmentSchema.parse(validSegment)).not.toThrow();
  });

  it('should reject invalid UUID', () => {
    const invalidSegment = {
      id: 'not-a-uuid',
      program_id: '123e4567-e89b-12d3-a456-426614174001',
      slot_type: 'news',
      state: 'queued',
      lang: 'en',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    expect(() => segmentSchema.parse(invalidSegment)).toThrow();
  });

  it('should reject invalid state', () => {
    const invalidSegment = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      program_id: '123e4567-e89b-12d3-a456-426614174001',
      slot_type: 'news',
      state: 'invalid_state',
      lang: 'en',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    expect(() => segmentSchema.parse(invalidSegment)).toThrow();
  });
});

describe('Universe Doc Schema', () => {
  it('should validate correct document', () => {
    const validDoc = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Test Document',
      body: '# Test Content',
      lang: 'en',
      status: 'published',
      tags: ['test'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    expect(() => universeDocSchema.parse(validDoc)).not.toThrow();
  });

  it('should reject empty title', () => {
    const invalidDoc = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      title: '',
      body: 'Content',
      lang: 'en',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    expect(() => universeDocSchema.parse(invalidDoc)).toThrow();
  });
});

describe('Job Schema', () => {
  it('should validate correct job', () => {
    const validJob = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      job_type: 'segment_make',
      payload: { segment_id: 'test' },
      state: 'pending',
      priority: 5,
      scheduled_for: new Date().toISOString(),
      attempts: 0,
      max_attempts: 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    expect(() => jobSchema.parse(validJob)).not.toThrow();
  });

  it('should reject invalid priority', () => {
    const invalidJob = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      job_type: 'segment_make',
      payload: {},
      state: 'pending',
      priority: 11, // Max is 10
      scheduled_for: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    expect(() => jobSchema.parse(invalidJob)).toThrow();
  });
});