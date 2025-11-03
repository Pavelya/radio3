import { franc } from 'franc-min';

/**
 * Language detection for documents
 */
export class LanguageDetector {
  private readonly supportedLanguages = ['eng', 'spa', 'cmn']; // English, Spanish, Chinese

  /**
   * Detect language from text
   * Returns ISO 639-1 code
   */
  detect(text: string): string {
    // Need at least 100 chars for reliable detection
    if (text.length < 100) {
      return 'en'; // Default to English
    }

    // Use franc for detection
    const detected = franc(text, { only: this.supportedLanguages });

    // Map ISO 639-3 to ISO 639-1
    const langMap: Record<string, string> = {
      'eng': 'en',
      'spa': 'es',
      'cmn': 'zh',
      'und': 'en' // Undetermined -> default to English
    };

    return langMap[detected] || 'en';
  }

  /**
   * Detect language with confidence score
   */
  detectWithConfidence(text: string): { lang: string; confidence: number } {
    if (text.length < 100) {
      return { lang: 'en', confidence: 0.5 };
    }

    const detected = franc(text, { only: this.supportedLanguages });

    // franc returns 'und' if uncertain
    if (detected === 'und') {
      return { lang: 'en', confidence: 0.3 };
    }

    const langMap: Record<string, string> = {
      'eng': 'en',
      'spa': 'es',
      'cmn': 'zh'
    };

    // Rough confidence estimate based on text length
    const confidence = Math.min(0.95, text.length / 1000);

    return {
      lang: langMap[detected] || 'en',
      confidence
    };
  }
}
