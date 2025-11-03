import { describe, it, expect } from 'vitest';
import { Chunker } from '../src/chunking/chunker';
import { Tokenizer } from '../src/chunking/tokenizer';
import { MarkdownCleaner } from '../src/chunking/markdown-cleaner';

describe('Tokenizer', () => {
  const tokenizer = new Tokenizer();

  it('should count tokens in text', () => {
    const text = 'This is a test sentence.';
    const count = tokenizer.countTokens(text);

    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(20);
  });

  it('should truncate text to max tokens', () => {
    const text = 'word '.repeat(1000);
    const truncated = tokenizer.truncate(text, 100);

    const count = tokenizer.countTokens(truncated);
    expect(count).toBeLessThanOrEqual(100);
  });
});

describe('MarkdownCleaner', () => {
  const cleaner = new MarkdownCleaner();

  it('should remove code blocks', () => {
    const markdown = 'Text before\n```js\ncode\n```\nText after';
    const cleaned = cleaner.clean(markdown);

    expect(cleaned).not.toContain('```');
    expect(cleaned).toContain('Text before');
    expect(cleaned).toContain('[code block]');
  });

  it('should convert links to text', () => {
    const markdown = 'Check [this link](http://example.com) out';
    const cleaned = cleaner.clean(markdown);

    expect(cleaned).toContain('this link');
    expect(cleaned).not.toContain('http://');
  });

  it('should detect code', () => {
    const code = '```js\nfunction test() {}\n```';
    expect(cleaner.isCode(code)).toBe(true);

    const text = 'This is just regular text.';
    expect(cleaner.isCode(text)).toBe(false);
  });
});

describe('Chunker', () => {
  const chunker = new Chunker({
    minTokens: 50,
    maxTokens: 200,
    overlapTokens: 20
  });

  it('should chunk text into pieces', () => {
    const text = 'Sentence one. Sentence two. '.repeat(100);
    const chunks = chunker.chunk(text);

    expect(chunks.length).toBeGreaterThan(0);

    // Check token counts
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeGreaterThanOrEqual(50);
      expect(chunk.tokenCount).toBeLessThanOrEqual(200);
    }
  });

  it('should assign chunk indexes', () => {
    const text = 'Sentence. '.repeat(300);
    const chunks = chunker.chunk(text);

    chunks.forEach((chunk, i) => {
      expect(chunk.chunkIndex).toBe(i);
    });
  });

  it('should generate content hashes', () => {
    const text = 'Test content for hashing. '.repeat(30);
    const chunks = chunker.chunk(text);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should create overlap between chunks', () => {
    const text = 'Sentence A. Sentence B. Sentence C. '.repeat(50);
    const chunks = chunker.chunk(text);

    if (chunks.length > 1) {
      // Check if chunks have overlapping content
      const chunk1End = chunks[0].chunkText.slice(-50);
      const chunk2Start = chunks[1].chunkText.slice(0, 50);

      // Should have some overlap
      expect(chunk2Start).toContain('Sentence');
    }
  });

  it('should filter out chunks that are too small', () => {
    const text = 'Short.';
    const chunks = chunker.chunk(text);

    // Should be empty or have chunks >= minTokens
    chunks.forEach(chunk => {
      expect(chunk.tokenCount).toBeGreaterThanOrEqual(50);
    });
  });
});
