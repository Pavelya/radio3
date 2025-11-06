import { describe, it, expect } from 'vitest';
import { ScriptGenerator } from '../script-generator';
import type { PromptContext } from '../../prompts/script-generation';
import type { DJ, RAGResult } from '../../schemas';

describe('ScriptGenerator Integration', () => {
  it('should generate real script from Claude', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('Skipping integration test: ANTHROPIC_API_KEY not set');
      return;
    }

    const generator = new ScriptGenerator(apiKey);

    const mockDJ: DJ = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Zara Nova',
      voice_id: '660e8400-e29b-41d4-a716-446655440000',
      lang: 'en',
      bio: 'An energetic DJ broadcasting from Mars Colony in the year 2525',
      personality_traits: ['Energetic', 'Optimistic', 'Curious'],
      avatar_url: null,
      stylebook_id: null,
      metadata: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    const ragContext: RAGResult = {
      chunks: [
        {
          chunk_id: 'chunk-001',
          source_id: 'mars-colony-update',
          source_type: 'universe_doc',
          chunk_text: 'The Mars Colony celebrated its 50th anniversary this week with a grand ceremony attended by over 100,000 colonists. The celebration featured a parade showcasing the latest Martian technologies and a speech by Colony Governor Elena Vasquez.',
          vector_score: 0.95,
          lexical_score: 0.88,
          recency_score: 0.92,
          final_score: 0.92,
        },
      ],
      query_time_ms: 100,
      total_results: 1,
    };

    const context: PromptContext = {
      segmentType: 'news',
      dj: mockDJ,
      ragContext,
      currentTime: new Date(),
      futureYear: 2525,
      programName: 'Morning News',
    };

    const script = await generator.generateScript({ context });

    // Verify structure
    expect(script.text).toBeTruthy();
    expect(script.text.length).toBeGreaterThan(50);
    expect(script.citations).toBeDefined();
    expect(script.tokens_in).toBeGreaterThan(0);
    expect(script.tokens_out).toBeGreaterThan(0);
    expect(script.model).toBe('claude-3-5-haiku-20241022');
    expect(script.temperature).toBe(0.7);
    expect(script.generated_at).toBeInstanceOf(Date);

    // Verify content quality
    expect(script.text).toContain('Mars'); // Should mention Mars
    expect(script.text.length).toBeGreaterThan(100); // Should have substantial content

    // Log for manual verification
    console.log('\n=== Generated Script ===');
    console.log(script.text);
    console.log('\n=== Citations ===');
    console.log(JSON.stringify(script.citations, null, 2));
    console.log('\n=== Metrics ===');
    console.log(`Input tokens: ${script.tokens_in}`);
    console.log(`Output tokens: ${script.tokens_out}`);
    console.log(`Model: ${script.model}`);
  }, 30000); // 30 second timeout for API call

  it('should handle different segment types', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('Skipping integration test: ANTHROPIC_API_KEY not set');
      return;
    }

    const generator = new ScriptGenerator(apiKey);

    const mockDJ: DJ = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Alex Chen',
      voice_id: '660e8400-e29b-41d4-a716-446655440000',
      lang: 'en',
      bio: 'A tech-savvy DJ covering the latest innovations',
      personality_traits: ['Analytical', 'Enthusiastic', 'Tech-savvy'],
      avatar_url: null,
      stylebook_id: null,
      metadata: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };

    const ragContext: RAGResult = {
      chunks: [
        {
          chunk_id: 'chunk-002',
          source_id: 'quantum-computer-breakthrough',
          source_type: 'event',
          chunk_text: 'Scientists at the Luna Research Institute announced a breakthrough in quantum computing, achieving stable quantum coherence for over 1 hour at room temperature.',
          vector_score: 0.93,
          lexical_score: 0.89,
          recency_score: 0.95,
          final_score: 0.93,
        },
      ],
      query_time_ms: 85,
      total_results: 1,
    };

    const context: PromptContext = {
      segmentType: 'tech',
      dj: mockDJ,
      ragContext,
      currentTime: new Date(),
      futureYear: 2525,
      programName: 'Tech Today',
    };

    const script = await generator.generateScript({ context });

    expect(script.text).toBeTruthy();
    expect(script.text.length).toBeGreaterThan(50);
    expect(script.text).toContain('quantum'); // Should mention quantum from the context

    console.log('\n=== Tech Segment Script ===');
    console.log(script.text);
  }, 30000);
});
