import { ClaudeClient } from './claude-client';
import { PromptTemplates } from './prompt-templates';
import { createLogger } from '@radio/core';
import type { GenerateResponse, SegmentContext, ScriptResult } from '@radio/core';

const logger = createLogger('script-generator');

/**
 * High-level script generation service
 */
export class ScriptGenerator {
  private client: ClaudeClient;
  private templates: PromptTemplates;

  constructor(apiKey?: string) {
    this.client = new ClaudeClient(apiKey);
    this.templates = new PromptTemplates();
  }

  /**
   * Generate segment script
   */
  async generateScript(context: SegmentContext): Promise<ScriptResult> {
    logger.info({
      slotType: context.slotType,
      targetDuration: context.targetDuration,
      ragChunks: context.ragChunks.length
    }, 'Generating script');

    const startTime = Date.now();

    // Build prompts
    const { systemPrompt, userPrompt } = this.templates.buildPrompt(context);

    // Generate with Claude
    const response = await this.client.generateWithRetry({
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.7
    });

    const generationTime = Date.now() - startTime;

    // Extract citations from RAG chunks used
    const citations = context.ragChunks.slice(0, 5).map((chunk, i) => ({
      index: i + 1,
      source_id: chunk.source_id,
      source_type: chunk.source_type,
      chunk_id: chunk.chunk_id,
      score: chunk.final_score
    }));

    logger.info({
      scriptLength: response.text.length,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      generationTime
    }, 'Script generated');

    return {
      scriptMd: response.text,
      citations,
      metrics: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        generationTimeMs: generationTime
      }
    };
  }

  /**
   * Validate script meets requirements
   */
  validateScript(script: string, targetDuration: number): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check length
    const wordCount = script.split(/\s+/).length;
    const estimatedDuration = wordCount / 150 * 60; // 150 wpm

    if (estimatedDuration < targetDuration * 0.8) {
      issues.push(`Script too short: ${Math.round(estimatedDuration)}s vs ${targetDuration}s target`);
    }

    if (estimatedDuration > targetDuration * 1.2) {
      issues.push(`Script too long: ${Math.round(estimatedDuration)}s vs ${targetDuration}s target`);
    }

    // Check minimum content
    if (wordCount < 50) {
      issues.push('Script has insufficient content');
    }

    // Check for inappropriate content markers
    const inappropriatePatterns = [
      /\[scene:/i,
      /\[cut to:/i,
      /\[music:/i,
      /^title:/im,
      /^segment \d+:/im
    ];

    for (const pattern of inappropriatePatterns) {
      if (pattern.test(script)) {
        issues.push(`Script contains inappropriate format marker: ${pattern}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}
