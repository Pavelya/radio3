import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptGenerator } from '../script-generator';
import { buildSystemPrompt, buildUserPrompt, type PromptContext } from '../../prompts/script-generation';
import type { DJ, RAGResult } from '../../schemas';

describe('ScriptGenerator', () => {
  let generator: ScriptGenerator;

  beforeEach(() => {
    const apiKey = process.env.ANTHROPIC_API_KEY || 'test-key';
    generator = new ScriptGenerator(apiKey);
  });

  describe('buildSystemPrompt', () => {
    it('should build system prompt with DJ personality', () => {
      const mockDJ: DJ = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Zara Nova',
        voice_id: '660e8400-e29b-41d4-a716-446655440000',
        lang: 'en',
        bio: 'A futuristic DJ from Mars Colony',
        personality_traits: ['Energetic', 'Curious', 'Optimistic'],
        avatar_url: null,
        stylebook_id: null,
        metadata: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const context: PromptContext = {
        segmentType: 'news',
        dj: mockDJ,
        ragContext: {
          chunks: [],
          query_time_ms: 100,
          total_results: 0,
        },
        currentTime: new Date('2025-01-15T10:30:00Z'),
        futureYear: 2525,
        programName: 'Morning Briefing',
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain('Zara Nova');
      expect(prompt).toContain('2525');
      expect(prompt).toContain('Energetic, Curious, Optimistic');
      expect(prompt).toContain('January');
    });

    it('should handle DJ with no bio', () => {
      const mockDJ: DJ = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Alex Chen',
        voice_id: '660e8400-e29b-41d4-a716-446655440000',
        lang: 'en',
        bio: null,
        personality_traits: ['Professional'],
        avatar_url: null,
        stylebook_id: null,
        metadata: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const context: PromptContext = {
        segmentType: 'tech',
        dj: mockDJ,
        ragContext: {
          chunks: [],
          query_time_ms: 50,
          total_results: 0,
        },
        currentTime: new Date(),
        futureYear: 2525,
        programName: 'Tech Talk',
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain('Alex Chen');
      expect(prompt).not.toContain('BACKGROUND:');
    });
  });

  describe('buildUserPrompt', () => {
    it('should include RAG context chunks', () => {
      const mockDJ: DJ = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test DJ',
        voice_id: '660e8400-e29b-41d4-a716-446655440000',
        lang: 'en',
        bio: null,
        personality_traits: [],
        avatar_url: null,
        stylebook_id: null,
        metadata: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const ragContext: RAGResult = {
        chunks: [
          {
            chunk_id: 'chunk-1',
            source_id: 'doc-1',
            source_type: 'universe_doc',
            chunk_text: 'Mars Colony celebrated its 50th anniversary.',
            vector_score: 0.95,
            lexical_score: 0.85,
            recency_score: 0.9,
            final_score: 0.92,
          },
          {
            chunk_id: 'chunk-2',
            source_id: 'doc-2',
            source_type: 'event',
            chunk_text: 'New space station opens next week.',
            vector_score: 0.88,
            lexical_score: 0.82,
            recency_score: 0.95,
            final_score: 0.89,
          },
        ],
        query_time_ms: 100,
        total_results: 2,
      };

      const context: PromptContext = {
        segmentType: 'news',
        dj: mockDJ,
        ragContext,
        currentTime: new Date(),
        futureYear: 2525,
        programName: 'News Brief',
      };

      const prompt = buildUserPrompt(context);

      expect(prompt).toContain('news segment');
      expect(prompt).toContain('universe_doc:doc-1');
      expect(prompt).toContain('Mars Colony celebrated');
      expect(prompt).toContain('event:doc-2');
      expect(prompt).toContain('space station opens');
    });

    it('should include previous segment summary when provided', () => {
      const mockDJ: DJ = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test DJ',
        voice_id: '660e8400-e29b-41d4-a716-446655440000',
        lang: 'en',
        bio: null,
        personality_traits: [],
        avatar_url: null,
        stylebook_id: null,
        metadata: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const context: PromptContext = {
        segmentType: 'culture',
        dj: mockDJ,
        ragContext: {
          chunks: [],
          query_time_ms: 50,
          total_results: 0,
        },
        currentTime: new Date(),
        futureYear: 2525,
        programName: 'Culture Hour',
        previousSegmentSummary: 'We discussed the Mars art festival',
      };

      const prompt = buildUserPrompt(context);

      expect(prompt).toContain('PREVIOUS SEGMENT: We discussed the Mars art festival');
    });
  });

  describe('extractCitations', () => {
    it('should extract citations from script text', () => {
      const script = `
      Breaking news from Mars Colony! [SOURCE: universe_doc:mars-herald-2525]
      Scientists discovered something amazing. [SOURCE: event:science-conf-001]
      `;

      const ragContext: RAGResult = {
        chunks: [
          {
            chunk_id: 'chunk-1',
            source_id: 'mars-herald-2525',
            source_type: 'universe_doc',
            chunk_text: 'Mars news...',
            vector_score: 0.95,
            lexical_score: 0.85,
            recency_score: 0.9,
            final_score: 0.92,
          },
          {
            chunk_id: 'chunk-2',
            source_id: 'science-conf-001',
            source_type: 'event',
            chunk_text: 'Science conference...',
            vector_score: 0.87,
            lexical_score: 0.82,
            recency_score: 0.88,
            final_score: 0.86,
          },
        ],
        query_time_ms: 50,
        total_results: 2,
      };

      const citations = generator['extractCitations'](script, ragContext);

      expect(citations).toHaveLength(2);
      expect(citations[0].title).toBe('universe_doc:mars-herald-2525');
      expect(citations[0].doc_id).toBe('mars-herald-2525');
      expect(citations[0].relevance_score).toBe(0.92);
      expect(citations[1].title).toBe('event:science-conf-001');
      expect(citations[1].doc_id).toBe('science-conf-001');
      expect(citations[1].relevance_score).toBe(0.86);
    });

    it('should handle scripts with no citations', () => {
      const script = 'Just some regular text without any citations.';
      const ragContext: RAGResult = {
        chunks: [],
        query_time_ms: 50,
        total_results: 0,
      };

      const citations = generator['extractCitations'](script, ragContext);

      expect(citations).toHaveLength(0);
    });

    it('should handle citations not found in RAG context', () => {
      const script = 'Breaking news! [SOURCE: nonexistent-doc]';
      const ragContext: RAGResult = {
        chunks: [],
        query_time_ms: 50,
        total_results: 0,
      };

      const citations = generator['extractCitations'](script, ragContext);

      // Should not fail, just skip missing citations
      expect(citations).toHaveLength(0);
    });
  });
});
