import { z } from 'zod';

/**
 * Citation with relevance score - used during script generation
 * This extends the basic citation with relevance scoring
 */
export const scriptCitationSchema = z.object({
  doc_id: z.string().describe('UUID of source document'),
  chunk_id: z.string().describe('UUID of specific chunk'),
  title: z.string().describe('Title/reference of source'),
  relevance_score: z.number().min(0).max(1).describe('Relevance score from RAG'),
});

export type ScriptCitation = z.infer<typeof scriptCitationSchema>;

/**
 * Segment script with metadata
 * Result of LLM generation with tracking info
 */
export const segmentScriptSchema = z.object({
  text: z.string().min(50).max(5000).describe('Generated script in Markdown'),
  citations: z.array(scriptCitationSchema).describe('Source references'),
  tokens_in: z.number().int().positive().describe('Input tokens used'),
  tokens_out: z.number().int().positive().describe('Output tokens generated'),
  model: z.string().describe('LLM model used'),
  temperature: z.number().min(0).max(2).describe('Temperature setting'),
  generated_at: z.date().default(() => new Date()).describe('Generation timestamp'),
});

export type SegmentScript = z.infer<typeof segmentScriptSchema>;
