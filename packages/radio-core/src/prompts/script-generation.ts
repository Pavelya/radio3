import type { DJ } from '../schemas/djs.schema';
import type { RAGResult } from '../schemas/rag.schema';

/**
 * Valid segment types for script generation
 */
export type SegmentType = 'news' | 'culture' | 'interview' | 'station_id' | 'weather' | 'tech';

/**
 * Context required for prompt assembly
 */
export interface PromptContext {
  segmentType: SegmentType;
  dj: DJ;
  ragContext: RAGResult;
  currentTime: Date;
  futureYear: number;
  programName: string;
  previousSegmentSummary?: string;
}

/**
 * Build system prompt with DJ personality and instructions
 */
export function buildSystemPrompt(ctx: PromptContext): string {
  const { dj, futureYear, currentTime } = ctx;

  // Extract personality traits as a readable string
  const personalityTraits = dj.personality_traits.length > 0
    ? dj.personality_traits.join(', ')
    : 'Professional, engaging, informative';

  return `You are ${dj.name}, a radio DJ broadcasting in the year ${futureYear}.

PERSONALITY:
${personalityTraits}

${dj.bio ? `BACKGROUND:\n${dj.bio}\n` : ''}

CURRENT TIME: ${formatFutureTime(currentTime, futureYear)}

INSTRUCTIONS:
- Stay in character as ${dj.name}
- Reference the current date and time naturally
- Use information from the provided context
- Keep the tone professional but engaging
- Cite sources using [SOURCE: title] format
- Target length: ${getTargetLength(ctx.segmentType)} words
- Format output in Markdown
- Write as if speaking directly to the audience`;
}

/**
 * Build user prompt with RAG context and segment instructions
 */
export function buildUserPrompt(ctx: PromptContext): string {
  const { segmentType, ragContext, previousSegmentSummary } = ctx;

  let prompt = `Generate a ${segmentType} segment script.\n\n`;

  if (previousSegmentSummary) {
    prompt += `PREVIOUS SEGMENT: ${previousSegmentSummary}\n\n`;
  }

  prompt += `RELEVANT INFORMATION:\n`;
  for (const chunk of ragContext.chunks) {
    // Use source_id as the title/reference
    const title = getChunkTitle(chunk);
    prompt += `\n[SOURCE: ${title}]\n${chunk.chunk_text}\n`;
  }

  prompt += `\n\nGenerate the script now:`;

  return prompt;
}

/**
 * Get target word count for segment type
 */
function getTargetLength(type: SegmentType): number {
  const lengths: Record<SegmentType, number> = {
    news: 200,
    culture: 300,
    interview: 400,
    station_id: 50,
    weather: 150,
    tech: 250,
  };
  return lengths[type] || 200;
}

/**
 * Format current time as future date
 */
function formatFutureTime(now: Date, futureYear: number): string {
  const month = now.toLocaleString('en-US', { month: 'long' });
  const day = now.getDate();
  const time = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${month} ${day}, ${futureYear} at ${time}`;
}

/**
 * Extract a readable title from RAG chunk
 */
function getChunkTitle(chunk: { source_id: string; source_type: string }): string {
  // Use source_id as the reference
  // Format: "source_type:source_id"
  return `${chunk.source_type}:${chunk.source_id}`;
}
