import { encode } from 'gpt-3-encoder';

/**
 * Tokenizer for estimating chunk sizes
 * Uses GPT-3 tokenizer as approximation
 */
export class Tokenizer {
  /**
   * Count tokens in text
   */
  countTokens(text: string): number {
    try {
      return encode(text).length;
    } catch (error) {
      // Fallback: approximate as word count * 1.3
      return Math.ceil(text.split(/\s+/).length * 1.3);
    }
  }

  /**
   * Truncate text to max tokens
   */
  truncate(text: string, maxTokens: number): string {
    const tokens = encode(text);
    if (tokens.length <= maxTokens) {
      return text;
    }

    // Decode truncated tokens
    // Note: This is approximate, may need adjustment
    const words = text.split(/\s+/);
    const targetWords = Math.floor(maxTokens / 1.3);
    return words.slice(0, targetWords).join(' ');
  }
}
