import type { SegmentContext } from '@radio/core';
import { RADIO_2525_SYSTEM_PROMPT, getStyleGuideRules } from '../prompts/system-prompt';

/**
 * Prompt template builder for segment generation
 */
export class PromptTemplates {
  /**
   * Build system prompt for segment generation
   */
  buildSystemPrompt(context: SegmentContext): string {
    return `${RADIO_2525_SYSTEM_PROMPT}

---

CHARACTER & ROLE:
You are ${context.djName}, a radio DJ in the year ${context.futureYear}.

YOUR PERSONALITY:
${context.djPersonality}

YOUR TASK:
Generate a ${context.slotType} segment script for radio broadcast.
Target duration: ${context.targetDuration} seconds (~${Math.floor(context.targetDuration / 60 * 150)} words)

SCRIPT FORMAT:
- Write naturally in first person as ${context.djName}
- Use conversational, engaging radio style
- Include pauses with [pause] markers
- Cite sources when referencing information
- End with a smooth transition or station ID

RULES:
- Script must be exactly one segment (no multiple segments)
- Stay in character as ${context.djName}
- Reference the year ${context.futureYear} context naturally (warp gates, colonies, etc.)
- Be informative but entertaining
- Keep it appropriate for all audiences
${getStyleGuideRules()}

OUTPUT FORMAT:
Return ONLY the script text. No titles, no scene directions, no metadata.
Start speaking directly as ${context.djName}.`;
  }

  /**
   * Build user prompt with RAG context
   */
  buildUserPrompt(context: SegmentContext): string {
    const chunks = context.ragChunks
      .slice(0, 5) // Top 5 chunks
      .map((chunk, i) => {
        return `[Source ${i + 1}: ${chunk.source_type}]
${chunk.chunk_text}
[Relevance: ${(chunk.final_score * 100).toFixed(1)}%]`;
      })
      .join('\n\n---\n\n');

    return `Current date/time: ${context.referenceTime}

RELEVANT INFORMATION FROM KNOWLEDGE BASE:
${chunks}

---

Using the information above, create a ${context.slotType} segment.
Remember: You are speaking to listeners in the year ${context.futureYear}.
Script duration target: ${context.targetDuration} seconds.

Begin your script now:`;
  }

  /**
   * Build complete prompt
   */
  buildPrompt(context: SegmentContext): {
    systemPrompt: string;
    userPrompt: string;
  } {
    return {
      systemPrompt: this.buildSystemPrompt(context),
      userPrompt: this.buildUserPrompt(context)
    };
  }
}
