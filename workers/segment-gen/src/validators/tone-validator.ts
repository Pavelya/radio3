import { createLogger, type ToneAnalysis } from '@radio/core';

const logger = createLogger('tone-validator');

/**
 * Validates script tone against style guide
 * Checks for dystopian keywords, fantasy elements, anachronisms, and tone balance
 */
export class ToneValidator {
  /**
   * Analyze script tone and flag issues
   */
  analyzeScript(script: string): ToneAnalysis {
    const issues: string[] = [];
    const suggestions: string[] = [];

    const lowerScript = script.toLowerCase();

    // Check for dystopian keywords
    const dystopianKeywords = [
      'apocalypse',
      'wasteland',
      'enslaved',
      'hopeless',
      'doomed',
      'destroyed',
      'ruins',
      'collapse',
      'failed',
    ];

    dystopianKeywords.forEach((keyword) => {
      if (lowerScript.includes(keyword)) {
        issues.push(`Contains dystopian keyword: "${keyword}"`);
        suggestions.push('Reframe negative outcomes as challenges being addressed');
      }
    });

    // Check for fantasy/magic elements
    const fantasyKeywords = [
      'magic',
      'supernatural',
      'psychic',
      'telepathy',
      'mystical',
      'prophecy',
    ];

    fantasyKeywords.forEach((keyword) => {
      if (lowerScript.includes(keyword)) {
        issues.push(`Contains fantasy element: "${keyword}"`);
        suggestions.push('Replace with technology-based explanation');
      }
    });

    // Check for optimistic indicators
    const optimisticKeywords = [
      'breakthrough',
      'discovery',
      'achievement',
      'success',
      'innovation',
      'progress',
      'solution',
      'advancement',
    ];

    const optimismCount = optimisticKeywords.filter((kw) =>
      lowerScript.includes(kw)
    ).length;

    // Check for realistic problem indicators
    const realismKeywords = [
      'challenge',
      'problem',
      'difficulty',
      'concern',
      'debate',
      'question',
      'risk',
      'limitation',
    ];

    const realismCount = realismKeywords.filter((kw) =>
      lowerScript.includes(kw)
    ).length;

    // Check for wonder indicators
    const wonderKeywords = [
      'discover',
      'mystery',
      'unknown',
      'incredible',
      'amazing',
      'wonder',
      'fascinating',
      'remarkable',
    ];

    const wonderCount = wonderKeywords.filter((kw) =>
      lowerScript.includes(kw)
    ).length;

    // Calculate approximate balance
    const total = optimismCount + realismCount + wonderCount + 1; // +1 to avoid division by zero
    const optimismPct = (optimismCount / total) * 100;
    const realismPct = (realismCount / total) * 100;
    const wonderPct = (wonderCount / total) * 100;

    // Check balance (target: 60/30/10)
    if (optimismPct < 40) {
      issues.push('Script may be too pessimistic');
      suggestions.push('Add more positive outcomes, achievements, or solutions');
    }

    if (optimismPct > 80) {
      issues.push('Script may be unrealistically optimistic');
      suggestions.push('Acknowledge real challenges or limitations');
    }

    if (realismCount === 0) {
      issues.push('No realistic challenges mentioned');
      suggestions.push('Include at least one practical concern or difficulty');
    }

    // Check for modern references
    const modernKeywords = [
      'tiktok',
      'facebook',
      'twitter',
      'iphone',
      'google',
      'amazon',
      'covid',
      '2024',
      '2023',
      '2022',
      '2021',
      '2020',
    ];

    modernKeywords.forEach((keyword) => {
      if (lowerScript.includes(keyword)) {
        issues.push(`Contains anachronistic reference: "${keyword}"`);
        suggestions.push('Replace with 2525-appropriate equivalent');
      }
    });

    // Calculate overall score
    let score = 100;
    score -= issues.length * 10;
    score = Math.max(0, Math.min(100, score));

    const analysis: ToneAnalysis = {
      score,
      optimismPct: Math.round(optimismPct),
      realismPct: Math.round(realismPct),
      wonderPct: Math.round(wonderPct),
      issues,
      suggestions,
    };

    logger.info(
      {
        score,
        balance: `${analysis.optimismPct}/${analysis.realismPct}/${analysis.wonderPct}`,
        issues: issues.length,
      },
      'Tone analysis complete'
    );

    return analysis;
  }

  /**
   * Validate if script meets minimum quality threshold
   */
  isAcceptable(analysis: ToneAnalysis): boolean {
    const minScore = parseInt(process.env.TONE_MIN_ACCEPTABLE_SCORE || '70', 10);
    return analysis.score >= minScore && analysis.issues.length <= 2;
  }
}
