import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logger';
import type { SegmentScript, ScriptCitation, RAGResult } from '../schemas';
import { segmentScriptSchema } from '../schemas/script.schema';
import { buildSystemPrompt, buildUserPrompt, type PromptContext } from '../prompts/script-generation';

const logger = createLogger('script-generator');

export interface GenerateScriptOptions {
  context: PromptContext;
  temperature?: number;
  maxTokens?: number;
  cacheKey?: string;
}

/**
 * ScriptGenerator - generates radio scripts using Claude LLM
 */
export class ScriptGenerator {
  private anthropic: Anthropic;
  private model: string;

  constructor(apiKey: string, model = 'claude-3-5-haiku-20241022') {
    this.anthropic = new Anthropic({ apiKey });
    this.model = model;
  }

  /**
   * Generate a radio script from context
   */
  async generateScript(options: GenerateScriptOptions): Promise<SegmentScript> {
    const { context, temperature = 0.7, maxTokens = 2000 } = options;

    const systemPrompt = buildSystemPrompt(context);
    const userPrompt = buildUserPrompt(context);

    logger.info({
      segmentType: context.segmentType,
      djName: context.dj.name,
      ragChunks: context.ragContext.chunks.length,
    }, 'Generating script');

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt,
        }],
      });

      const scriptText = this.extractText(response);
      const citations = this.extractCitations(scriptText, context.ragContext);

      const script: SegmentScript = {
        text: scriptText,
        citations,
        tokens_in: response.usage.input_tokens,
        tokens_out: response.usage.output_tokens,
        model: this.model,
        temperature,
        generated_at: new Date(),
      };

      // Validate with Zod schema
      const validated = segmentScriptSchema.parse(script);

      logger.info({
        scriptLength: scriptText.length,
        citationCount: citations.length,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      }, 'Script generated successfully');

      return validated;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error, context: { segmentType: context.segmentType, djName: context.dj.name } }, 'Script generation failed');
      throw new Error(`Script generation failed: ${errorMessage}`);
    }
  }

  /**
   * Extract text content from Claude response
   */
  private extractText(response: Anthropic.Message): string {
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }
    return content.text;
  }

  /**
   * Extract citations from script text and match to RAG chunks
   */
  private extractCitations(
    script: string,
    ragContext: RAGResult
  ): ScriptCitation[] {
    const citations: ScriptCitation[] = [];
    const citationRegex = /\[SOURCE:\s*([^\]]+)\]/g;

    let match;
    while ((match = citationRegex.exec(script)) !== null) {
      const reference = match[1].trim();

      // Try to find matching chunk
      const chunk = ragContext.chunks.find(c => {
        const chunkRef = `${c.source_type}:${c.source_id}`;
        return chunkRef === reference || c.source_id === reference;
      });

      if (chunk) {
        citations.push({
          doc_id: chunk.source_id,
          chunk_id: chunk.chunk_id,
          title: reference,
          relevance_score: chunk.final_score,
        });
      } else {
        // Log missing citation but don't fail
        logger.warn({ reference }, 'Citation in script not found in RAG context');
      }
    }

    return citations;
  }
}
