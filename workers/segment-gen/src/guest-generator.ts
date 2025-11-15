import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@radio/core';
import type { GuestProfile } from '@radio/core';

const logger = createLogger('guest-generator');

export class GuestGenerator {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Generate a fictional guest character for interviews
   */
  async generateGuest(
    topic: string,
    guestType: 'expert' | 'witness' | 'official' | 'artist' | 'scientist',
    worldContext: string
  ): Promise<GuestProfile> {
    logger.info({ topic, guestType }, 'Generating guest character');

    const prompt = `You are creating a fictional guest character for an interview on AI Radio 2525, a radio station broadcasting from the year 2525.

INTERVIEW TOPIC: ${topic}

GUEST TYPE: ${guestType}

WORLD CONTEXT (Year 2525):
${worldContext}

Create a detailed guest character profile that fits naturally into the world of 2525. This world is inspired by classic 20th-century sci-fi authors (Asimov, Clarke, Heinlein) - optimistic about humanity's future, with space travel, alien contact, and advanced technology.

Generate the following profile:

1. NAME: A realistic name appropriate for 2525 (can be from any Earth culture or alien species)

2. ROLE/TITLE: Their current position or occupation (be specific and creative)

3. BACKGROUND: A brief 2-3 sentence background covering their origin, education, career path, and how they became an expert on this topic

4. EXPERTISE: Specific areas of knowledge and experience (2-3 bullet points)

5. PERSONALITY: Key personality traits that will come through in conversation (3-4 adjectives with brief explanation)

6. SPEAKING STYLE: How they communicate (formal/casual, technical/accessible, passionate/measured, etc.)

Guidelines:
- Make them credible and interesting
- Incorporate 2525 world details naturally (multiple planets, alien species, advanced tech)
- Give them depth and specific knowledge
- Make them feel real, not stereotypical
- Ensure they can provide insightful answers on the interview topic

Return ONLY a JSON object with this structure:
{
  "name": "...",
  "role": "...",
  "background": "...",
  "expertise": "...",
  "personality": "...",
  "speakingStyle": "..."
}`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse guest profile JSON');
    }

    const profile = JSON.parse(jsonMatch[0]) as GuestProfile;

    logger.info({
      name: profile.name,
      role: profile.role
    }, 'Guest character generated');

    return profile;
  }

  /**
   * Generate interview questions for a specific guest
   */
  async generateInterviewQuestions(
    topic: string,
    guestProfile: GuestProfile,
    hostPersonality: string,
    questionCount: number = 8
  ): Promise<string[]> {
    logger.info({ topic, guest: guestProfile.name }, 'Generating interview questions');

    const prompt = `You are preparing interview questions for AI Radio 2525, broadcasting from the year 2525.

HOST PERSONALITY: ${hostPersonality}

GUEST: ${guestProfile.name}
Role: ${guestProfile.role}
Expertise: ${guestProfile.expertise}

INTERVIEW TOPIC: ${topic}

Generate ${questionCount} insightful interview questions that:
1. Progress naturally from introduction to deeper topics
2. Match the host's personality and style
3. Draw on the guest's specific expertise
4. Are appropriate for radio (clear, focused, conversational)
5. Incorporate the 2525 world context naturally
6. Build on each other to create a narrative arc
7. Include both broad questions and specific follow-ups
8. Encourage detailed, interesting answers

Return ONLY a JSON array of question strings:
["question 1", "question 2", ...]`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse questions JSON');
    }

    const questions = JSON.parse(jsonMatch[0]) as string[];

    logger.info({ count: questions.length }, 'Interview questions generated');

    return questions;
  }
}
