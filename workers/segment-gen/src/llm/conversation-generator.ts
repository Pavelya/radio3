import { ClaudeClient } from './claude-client';
import {
  createInterviewPrompt,
  createPanelPrompt,
  createDebatePrompt,
  createDialoguePrompt,
} from './conversation-prompts';
import { createLogger } from '@radio/core';
import type { ConversationContext, ConversationTurn, ConversationResult } from '@radio/core';

const logger = createLogger('conversation-generator');

/**
 * Service for generating multi-speaker conversation scripts
 */
export class ConversationGenerator {
  private client: ClaudeClient;

  constructor(apiKey?: string) {
    this.client = new ClaudeClient(apiKey);
  }

  /**
   * Generate multi-speaker conversation
   */
  async generateConversation(
    context: ConversationContext
  ): Promise<ConversationResult> {
    logger.info(
      {
        format: context.format,
        host: context.host.name,
        participants: context.participants.length,
        topic: context.topic,
      },
      'Generating multi-speaker conversation'
    );

    const startTime = Date.now();

    // Select appropriate prompt template
    let prompt: string;
    switch (context.format) {
      case 'interview':
        prompt = createInterviewPrompt(context);
        break;
      case 'panel':
        prompt = createPanelPrompt(context);
        break;
      case 'debate':
        prompt = createDebatePrompt(context);
        break;
      case 'dialogue':
        prompt = createDialoguePrompt(context);
        break;
      default:
        throw new Error(`Unknown conversation format: ${context.format}`);
    }

    // Generate with Claude
    const response = await this.client.generateWithRetry({
      systemPrompt: 'You are an expert radio script writer specializing in natural dialogue.',
      userPrompt: prompt,
      maxTokens: 4000,
      temperature: 0.9, // Higher temperature for more natural conversation
    });

    const generationTime = Date.now() - startTime;

    logger.info(
      {
        length: response.text.length,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        format: context.format,
      },
      'Conversation script generated'
    );

    // Parse dialogue script into turns
    const turns = this.parseDialogueScript(response.text);

    logger.info(
      {
        turns: turns.length,
        speakers: [...new Set(turns.map(t => t.speaker))],
      },
      'Parsed conversation turns'
    );

    return {
      turns,
      fullScript: response.text,
      metrics: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        generationTimeMs: generationTime,
      },
    };
  }

  /**
   * Parse dialogue script into structured turns
   */
  private parseDialogueScript(script: string): ConversationTurn[] {
    const turns: ConversationTurn[] = [];
    const lines = script.split('\n');

    let currentSpeaker: string | null = null;
    let currentText: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        continue;
      }

      // Check if line starts with speaker label (all caps followed by colon)
      const speakerMatch = trimmed.match(/^([A-Z][A-Z\s\-]+):\s*(.+)$/);

      if (speakerMatch) {
        // Save previous turn if exists
        if (currentSpeaker && currentText.length > 0) {
          turns.push({
            speaker: currentSpeaker,
            text: currentText.join(' ').trim(),
          });
        }

        // Start new turn
        currentSpeaker = speakerMatch[1].trim();
        currentText = [speakerMatch[2]];
      } else if (currentSpeaker) {
        // Continuation of current turn
        currentText.push(trimmed);
      }
    }

    // Save final turn
    if (currentSpeaker && currentText.length > 0) {
      turns.push({
        speaker: currentSpeaker,
        text: currentText.join(' ').trim(),
      });
    }

    return turns;
  }

  /**
   * Validate conversation quality
   */
  validateConversation(turns: ConversationTurn[]): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check minimum turns
    if (turns.length < 4) {
      issues.push('Conversation too short (less than 4 turns)');
    }

    // Check speaker variety
    const speakers = new Set(turns.map(t => t.speaker));
    if (speakers.size < 2) {
      issues.push('Need at least 2 speakers');
    }

    // Check for very short turns
    const shortTurns = turns.filter(t => t.text.length < 20);
    if (shortTurns.length > turns.length * 0.3) {
      issues.push('Too many very short turns');
    }

    // Check for very long turns (monologues)
    const longTurns = turns.filter(t => t.text.length > 500);
    if (longTurns.length > turns.length * 0.2) {
      issues.push('Some turns are too long (reduce monologuing)');
    }

    // Check speaker balance
    const speakerCounts = turns.reduce((acc, t) => {
      acc[t.speaker] = (acc[t.speaker] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const counts = Object.values(speakerCounts);
    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);

    if (maxCount > minCount * 3) {
      issues.push('Speaker participation is unbalanced');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
