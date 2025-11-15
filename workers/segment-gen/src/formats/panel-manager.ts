import { createLogger } from '@radio/core';

const logger = createLogger('panel-manager');

interface Panelist {
  name: string;
  perspective: string;
  expertise: string;
}

interface PanelTopic {
  mainQuestion: string;
  subQuestions: string[];
  controversialPoints: string[];
}

export class PanelDiscussionManager {
  /**
   * Generate balanced panel composition
   */
  generatePanelComposition(
    topic: string,
    panelistCount: number
  ): Array<{ role: string; perspective: string; expertise: string }> {
    // Ensure diverse perspectives
    const compositions: Record<number, Array<any>> = {
      2: [
        { role: 'Advocate', perspective: 'strongly supports', expertise: 'implementation' },
        { role: 'Critic', perspective: 'expresses concerns', expertise: 'risks' },
      ],
      3: [
        { role: 'Optimist', perspective: 'enthusiastic supporter', expertise: 'benefits' },
        { role: 'Realist', perspective: 'balanced pragmatist', expertise: 'feasibility' },
        { role: 'Skeptic', perspective: 'cautious questioner', expertise: 'limitations' },
      ],
      4: [
        { role: 'Visionary', perspective: 'big-picture thinker', expertise: 'future implications' },
        { role: 'Practitioner', perspective: 'hands-on expert', expertise: 'current applications' },
        { role: 'Ethicist', perspective: 'moral considerations', expertise: 'societal impact' },
        { role: 'Analyst', perspective: 'data-driven evaluator', expertise: 'empirical evidence' },
      ],
    };

    return compositions[panelistCount] || compositions[3];
  }

  /**
   * Generate panel discussion topics with controversy points
   */
  generatePanelTopics(mainTopic: string): PanelTopic {
    return {
      mainQuestion: `What does ${mainTopic} mean for humanity's future?`,
      subQuestions: [
        `How does this compare to similar developments in the past?`,
        `What are the potential risks we should consider?`,
        `Who benefits most from this development?`,
        `What regulatory frameworks do we need?`,
      ],
      controversialPoints: [
        'Resource allocation priorities',
        'Ethical implications',
        'Long-term sustainability',
        'Equity and access concerns',
      ],
    };
  }

  /**
   * Ensure balanced speaking time
   */
  balanceSpeakingTurns(
    totalTurns: number,
    panelistCount: number
  ): Record<string, number> {
    const turnsPerPanelist = Math.floor(totalTurns / (panelistCount + 1)); // +1 for host
    const remainder = totalTurns % (panelistCount + 1);

    const distribution: Record<string, number> = {
      host: turnsPerPanelist + remainder, // Host gets extra turns
    };

    for (let i = 0; i < panelistCount; i++) {
      distribution[`panelist_${i + 1}`] = turnsPerPanelist;
    }

    return distribution;
  }
}
