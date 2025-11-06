import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@radio/core';
import type { GenerateRequest, GenerateResponse } from '@radio/core';

const logger = createLogger('claude-client');

/**
 * Client for Anthropic Claude API
 */
export class ClaudeClient {
  private client: Anthropic;
  private readonly defaultModel = 'claude-3-5-haiku-20241022';

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;

    if (!key) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({
      apiKey: key
    });

    logger.info({ model: this.defaultModel }, 'Claude client initialized');
  }

  /**
   * Generate text completion
   */
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const {
      systemPrompt,
      userPrompt,
      maxTokens = 2048,
      temperature = 0.7,
      model = this.defaultModel
    } = request;

    logger.info({
      model,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      maxTokens,
      temperature
    }, 'Generating completion');

    const startTime = Date.now();

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const duration = Date.now() - startTime;

      // Extract text from response
      const text = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as any).text)
        .join('');

      logger.info({
        duration,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        stopReason: response.stop_reason
      }, 'Generation complete');

      return {
        text,
        stopReason: response.stop_reason || 'unknown',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        duration
      }, 'Generation failed');

      // Handle rate limits
      if (error instanceof Anthropic.APIError) {
        if (error.status === 429) {
          throw new Error('Rate limit exceeded');
        }
        if (error.status === 529) {
          throw new Error('API overloaded, retry later');
        }
      }

      throw error;
    }
  }

  /**
   * Generate with retry logic
   */
  async generateWithRetry(
    request: GenerateRequest,
    maxRetries: number = 3
  ): Promise<GenerateResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.generate(request);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        logger.warn({
          attempt,
          maxRetries,
          error: lastError.message
        }, 'Generation attempt failed, retrying');

        // Exponential backoff
        if (attempt < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await this.sleep(delayMs);
        }
      }
    }

    throw lastError || new Error('Unknown error after retries');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
