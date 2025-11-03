import crypto from 'crypto';
import type { Chunk, ChunkConfig } from '@radio/core';
import { Tokenizer } from './tokenizer';
import { MarkdownCleaner } from './markdown-cleaner';
import { LanguageDetector } from './language-detector';

/**
 * Text chunking service
 * Splits documents into semantic chunks for RAG
 */
export class Chunker {
  private tokenizer: Tokenizer;
  private cleaner: MarkdownCleaner;
  private detector: LanguageDetector;
  private config: ChunkConfig;

  constructor(config?: Partial<ChunkConfig>) {
    this.tokenizer = new Tokenizer();
    this.cleaner = new MarkdownCleaner();
    this.detector = new LanguageDetector();
    this.config = {
      minTokens: config?.minTokens ?? 300,
      maxTokens: config?.maxTokens ?? 800,
      overlapTokens: config?.overlapTokens ?? 50
    };
  }

  /**
   * Chunk a document into pieces
   */
  chunk(text: string, providedLang?: string): Chunk[] {
    // Detect language if not provided
    const lang = providedLang || this.detector.detect(text);

    // Clean Markdown
    const cleaned = this.cleaner.clean(text);

    // Split into sentences
    const sentences = this.splitSentences(cleaned);

    // Group sentences into chunks
    const chunks: Chunk[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.tokenizer.countTokens(sentence);

      // If adding this sentence exceeds max, save current chunk
      if (currentTokens + sentenceTokens > this.config.maxTokens && currentChunk.length > 0) {
        chunks.push(this.createChunk(currentChunk.join(' '), chunks.length, lang));

        // Start new chunk with overlap
        currentChunk = this.getOverlapSentences(currentChunk);
        currentTokens = this.tokenizer.countTokens(currentChunk.join(' '));
      }

      currentChunk.push(sentence);
      currentTokens += sentenceTokens;
    }

    // Save final chunk
    if (currentChunk.length > 0) {
      chunks.push(this.createChunk(currentChunk.join(' '), chunks.length, lang));
    }

    // Filter out chunks that are too small
    return chunks.filter(c => c.tokenCount >= this.config.minTokens);
  }

  /**
   * Split text into sentences
   */
  private splitSentences(text: string): string[] {
    // Split on sentence boundaries
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return sentences;
  }

  /**
   * Get last N sentences for overlap
   */
  private getOverlapSentences(sentences: string[]): string[] {
    let overlap: string[] = [];
    let tokens = 0;

    // Add sentences from end until we reach overlap target
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i];
      const sentenceTokens = this.tokenizer.countTokens(sentence);

      if (tokens + sentenceTokens > this.config.overlapTokens) {
        break;
      }

      overlap.unshift(sentence);
      tokens += sentenceTokens;
    }

    return overlap;
  }

  /**
   * Create chunk object with metadata
   */
  private createChunk(text: string, index: number, lang: string): Chunk {
    const tokenCount = this.tokenizer.countTokens(text);
    const contentHash = this.hashContent(text);

    return {
      chunkText: text,
      chunkIndex: index,
      tokenCount,
      contentHash,
      lang
    };
  }

  /**
   * Generate SHA256 hash of content
   */
  private hashContent(text: string): string {
    return crypto
      .createHash('sha256')
      .update(text)
      .digest('hex');
  }
}
