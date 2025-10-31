import { faker } from '@faker-js/faker';
import type { Segment, SegmentState } from '@radio/core';

export interface SegmentFactoryOptions {
  id?: string;
  program_id?: string;
  slot_type?: string;
  state?: SegmentState;
  lang?: string;
  script_md?: string | null;
  asset_id?: string | null;
  duration_sec?: number | null;
  scheduled_start_ts?: string | null;
  aired_at?: string | null;
  retry_count?: number;
  max_retries?: number;
  last_error?: string | null;
  citations?: Array<{ doc_id: string; chunk_id: string; title: string }>;
  cache_key?: string | null;
  parent_segment_id?: string | null;
  generation_metrics?: Record<string, unknown> | null;
  idempotency_key?: string | null;
  created_at?: string;
  updated_at?: string;
}

export function createSegment(options: SegmentFactoryOptions = {}): Segment {
  const now = new Date().toISOString();
  
  return {
    id: options.id ?? faker.string.uuid(),
    program_id: options.program_id ?? faker.string.uuid(),
    slot_type: options.slot_type ?? faker.helpers.arrayElement(['news', 'culture', 'interview']),
    state: options.state ?? 'queued',
    lang: options.lang ?? 'en',
    script_md: options.script_md ?? null,
    asset_id: options.asset_id ?? null,
    duration_sec: options.duration_sec ?? null,
    scheduled_start_ts: options.scheduled_start_ts ?? faker.date.future().toISOString(),
    aired_at: options.aired_at ?? null,
    retry_count: options.retry_count ?? 0,
    max_retries: options.max_retries ?? 3,
    last_error: options.last_error ?? null,
    citations: options.citations ?? [],
    cache_key: options.cache_key ?? null,
    parent_segment_id: options.parent_segment_id ?? null,
    generation_metrics: options.generation_metrics ?? null,
    idempotency_key: options.idempotency_key ?? null,
    created_at: options.created_at ?? faker.date.past().toISOString(),
    updated_at: options.updated_at ?? now
  };
}

export function createSegmentInState(
  state: SegmentState,
  options: SegmentFactoryOptions = {}
): Segment {
  return createSegment({ ...options, state });
}

export function createSegments(
  count: number,
  options: SegmentFactoryOptions = {}
): Segment[] {
  return Array.from({ length: count }, () => createSegment(options));
}