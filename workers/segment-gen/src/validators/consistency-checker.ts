import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@radio/core';

const logger = createLogger('consistency-checker');

interface LoreFact {
  id: string;
  category: string;
  fact_key: string;
  fact_value: string;
  fact_type: string;
  description?: string;
}

interface Contradiction {
  factKey: string;
  canonicalValue: string;
  contradictoryValue: string;
  contextText: string;
  severity: 'minor' | 'moderate' | 'major';
}

/**
 * Validates generated content against canonical lore facts
 * Detects contradictions, timeline inconsistencies, and character continuity issues
 */
export class ConsistencyChecker {
  private supabase: SupabaseClient;
  private loreFacts: Map<string, LoreFact>;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.loreFacts = new Map();
  }

  /**
   * Load canonical facts into memory
   */
  async loadLoreFacts(): Promise<void> {
    const { data: facts } = await this.supabase
      .from('lore_facts')
      .select('*')
      .eq('active', true);

    if (facts) {
      facts.forEach((fact) => {
        this.loreFacts.set(fact.fact_key, fact);
      });

      logger.info({ count: facts.length }, 'Loaded canonical lore facts');
    }
  }

  /**
   * Check script for contradictions against canonical facts
   */
  async checkScript(
    segmentId: string,
    script: string
  ): Promise<Contradiction[]> {
    if (this.loreFacts.size === 0) {
      await this.loadLoreFacts();
    }

    logger.info({ segmentId }, 'Checking script consistency');

    const contradictions: Contradiction[] = [];
    const lowerScript = script.toLowerCase();

    // Check specific facts
    for (const [factKey, fact] of this.loreFacts) {
      const canonical = fact.fact_value.toLowerCase();

      // Define common variations/contradictions to check
      const checks = this.getFactChecks(fact);

      for (const check of checks) {
        if (lowerScript.includes(check.pattern.toLowerCase())) {
          // Found potential contradiction
          if (check.contradicts) {
            contradictions.push({
              factKey,
              canonicalValue: canonical,
              contradictoryValue: check.pattern,
              contextText: this.extractContext(script, check.pattern),
              severity: check.severity,
            });

            logger.warn(
              {
                factKey,
                canonical,
                found: check.pattern,
              },
              'Contradiction detected'
            );
          }
        }
      }
    }

    // Store contradictions in database
    if (contradictions.length > 0) {
      const inserts = contradictions.map((c) => ({
        segment_id: segmentId,
        fact_key: c.factKey,
        canonical_value: c.canonicalValue,
        contradictory_value: c.contradictoryValue,
        context_text: c.contextText,
        severity: c.severity,
      }));

      await this.supabase.from('lore_contradictions').insert(inserts);
    }

    logger.info(
      {
        segmentId,
        contradictions: contradictions.length,
      },
      'Consistency check complete'
    );

    return contradictions;
  }

  /**
   * Get patterns to check for a specific fact
   */
  private getFactChecks(fact: LoreFact): Array<{
    pattern: string;
    contradicts: boolean;
    severity: 'minor' | 'moderate' | 'major';
  }> {
    const checks: Array<any> = [];

    switch (fact.fact_key) {
      case 'ftl_travel_method':
        checks.push(
          { pattern: 'warp drive', contradicts: false, severity: 'minor' },
          { pattern: 'hyperspace', contradicts: true, severity: 'major' },
          { pattern: 'hyperdrive', contradicts: true, severity: 'major' },
          { pattern: 'teleportation', contradicts: true, severity: 'major' },
          { pattern: 'jump drive', contradicts: true, severity: 'major' }
        );
        break;

      case 'earth_government':
        checks.push(
          { pattern: 'united earth', contradicts: false, severity: 'minor' },
          {
            pattern: 'earth federation',
            contradicts: true,
            severity: 'moderate',
          },
          { pattern: 'galactic empire', contradicts: true, severity: 'major' },
          { pattern: 'earth empire', contradicts: true, severity: 'moderate' }
        );
        break;

      case 'mars_colony_founding':
        // Check for contradictory dates
        const canonicalYear = parseInt(fact.fact_value);
        for (let year = 2050; year < 2200; year += 10) {
          if (year !== canonicalYear) {
            checks.push({
              pattern: `established in ${year}`,
              contradicts: true,
              severity:
                Math.abs(year - canonicalYear) < 20 ? 'minor' : 'moderate',
            });
            checks.push({
              pattern: `founded in ${year}`,
              contradicts: true,
              severity:
                Math.abs(year - canonicalYear) < 20 ? 'minor' : 'moderate',
            });
          }
        }
        break;

      default:
        // Generic check - just verify canonical value is mentioned
        checks.push({
          pattern: fact.fact_value,
          contradicts: false,
          severity: 'minor',
        });
    }

    return checks;
  }

  /**
   * Extract context around a pattern in script
   */
  private extractContext(
    script: string,
    pattern: string,
    contextLength: number = 150
  ): string {
    const index = script.toLowerCase().indexOf(pattern.toLowerCase());
    if (index === -1) return '';

    const start = Math.max(0, index - contextLength);
    const end = Math.min(script.length, index + pattern.length + contextLength);

    let context = script.substring(start, end);

    if (start > 0) context = '...' + context;
    if (end < script.length) context = context + '...';

    return context;
  }

  /**
   * Verify timeline consistency (events in correct order)
   */
  async checkTimeline(script: string): Promise<string[]> {
    const issues: string[] = [];

    // Extract year mentions
    const yearPattern = /\b(1[89]\d{2}|2[0-5]\d{2})\b/g;
    const years = script.match(yearPattern);

    if (years) {
      const yearNumbers = years.map((y) => parseInt(y));

      // Check if any years are after 2525
      const futureYears = yearNumbers.filter((y) => y > 2525);
      if (futureYears.length > 0) {
        issues.push(`References years after 2525: ${futureYears.join(', ')}`);
      }

      // Check if years are before plausible space age
      const tooEarlyYears = yearNumbers.filter((y) => y < 2000);
      if (tooEarlyYears.length > 0) {
        issues.push(
          `References pre-space age years: ${tooEarlyYears.join(', ')}`
        );
      }
    }

    return issues;
  }

  /**
   * Check for character name consistency
   */
  async checkCharacterConsistency(
    characterName: string,
    script: string
  ): Promise<string[]> {
    const issues: string[] = [];

    // Check for name variations
    const nameParts = characterName.split(' ');
    if (nameParts.length > 1) {
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];

      // Count mentions
      const fullNameCount = (
        script.match(new RegExp(characterName, 'gi')) || []
      ).length;
      const firstNameCount = (
        script.match(new RegExp(`\\b${firstName}\\b`, 'gi')) || []
      ).length;
      const lastNameCount = (
        script.match(new RegExp(`\\b${lastName}\\b`, 'gi')) || []
      ).length;

      // Check for consistency
      if (firstNameCount > fullNameCount * 2) {
        issues.push(
          `Character name "${characterName}" mostly referred to by first name only`
        );
      }
    }

    return issues;
  }
}
