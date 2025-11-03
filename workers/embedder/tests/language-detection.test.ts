import { describe, it, expect } from 'vitest';
import { LanguageDetector } from '../src/chunking/language-detector';
import { Chunker } from '../src/chunking/chunker';

describe('LanguageDetector', () => {
  const detector = new LanguageDetector();

  it('should detect English', () => {
    const text = 'This is a sample English text that is long enough for reliable detection. ' +
                 'We need at least one hundred characters to ensure accurate language identification.';
    const lang = detector.detect(text);

    expect(lang).toBe('en');
  });

  it('should detect Spanish', () => {
    const text = 'Este es un texto de ejemplo en español que es lo suficientemente largo para ' +
                 'una detección confiable. Necesitamos al menos cien caracteres para garantizar ' +
                 'una identificación precisa del idioma.';
    const lang = detector.detect(text);

    expect(lang).toBe('es');
  });

  it('should default to English for short text', () => {
    const text = 'Short';
    const lang = detector.detect(text);

    expect(lang).toBe('en');
  });

  it('should return confidence score', () => {
    const text = 'This is English text. '.repeat(20);
    const result = detector.detectWithConfidence(text);

    expect(result.lang).toBe('en');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

describe('Chunker with Language Detection', () => {
  const chunker = new Chunker();

  it('should add language to chunks', () => {
    const text = 'This is an English sentence. '.repeat(100);
    const chunks = chunker.chunk(text);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].lang).toBe('en');
  });

  it('should accept provided language', () => {
    const text = 'Text here. '.repeat(100);
    const chunks = chunker.chunk(text, 'es'); // Force Spanish

    expect(chunks[0].lang).toBe('es');
  });

  it('should maintain language across all chunks', () => {
    const text = 'Sentence. '.repeat(300);
    const chunks = chunker.chunk(text, 'en');

    chunks.forEach(chunk => {
      expect(chunk.lang).toBe('en');
    });
  });
});
