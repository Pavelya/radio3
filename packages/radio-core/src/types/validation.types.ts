/**
 * Types for script and content validation
 */

/**
 * Result of tone analysis validation
 */
export type ToneAnalysis = {
  score: number; // 0-100
  optimismPct: number;
  realismPct: number;
  wonderPct: number;
  issues: string[];
  suggestions: string[];
};
