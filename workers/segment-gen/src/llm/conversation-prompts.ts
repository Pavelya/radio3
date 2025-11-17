/**
 * Conversation prompt templates for multi-speaker segments
 */

import type { ConversationContext } from '@radio/core';
import { RADIO_2525_SYSTEM_PROMPT, getStyleGuideRules } from '../prompts/system-prompt';

/**
 * Interview prompt template
 */
export function createInterviewPrompt(ctx: ConversationContext): string {
  const year = ctx.futureYear || 2525;

  // Format broadcast time if provided
  const broadcastTimeInfo = ctx.referenceTime
    ? `\n\nBROADCAST TIME: ${new Date(ctx.referenceTime).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
      })} (Year ${year})\nThis is the current date and time in your world.`
    : '';

  return `${RADIO_2525_SYSTEM_PROMPT}

---

You are writing a radio interview script for AI Radio ${year}, broadcasting from the year ${year}.${broadcastTimeInfo}

HOST: ${ctx.host.name}
Personality: ${ctx.host.personality}

GUEST: ${ctx.participants[0].name}
Role: ${ctx.participants[0].role}
${ctx.participants[0].background ? `Background: ${ctx.participants[0].background}` : ''}
${ctx.participants[0].expertise ? `Expertise: ${ctx.participants[0].expertise}` : ''}

TOPIC: ${ctx.topic}

CONTEXT & RESEARCH:
${ctx.retrievedContext}

TARGET DURATION: ${Math.floor(ctx.duration / 60)} minutes (approximately ${Math.floor(ctx.duration / 10)} exchanges)

TONE: ${ctx.tone}

INSTRUCTIONS:
1. Write a natural, engaging interview in dialogue format
2. The host asks insightful questions that explore the topic deeply
3. The guest provides informative, interesting answers with specific details
4. Include natural conversational elements (brief acknowledgments, follow-up questions, transitions)
5. Keep the conversation flowing - no awkward pauses or repetitive questions
6. Each turn should be 2-4 sentences maximum for natural radio pacing
7. Incorporate the sci-fi world of ${year} naturally - mention space travel, alien species, advanced technology
8. Maintain the optimistic yet realistic tone of classic 20th-century sci-fi
9. Reference specific facts from the retrieved context when relevant
10. End with a natural conclusion and thank you
${getStyleGuideRules()}

FORMAT:
Write as a dialogue script:

HOST: [dialogue]

GUEST: [dialogue]

HOST: [dialogue]

etc.

Do not include stage directions, sound effects, or anything besides the spoken dialogue.
Begin the interview now:`;
}

/**
 * Panel discussion prompt template
 */
export function createPanelPrompt(ctx: ConversationContext): string {
  const year = ctx.futureYear || 2525;
  const panelists = ctx.participants
    .map(p => `- ${p.name} (${p.role}): ${p.expertise || 'Expert panelist'}`)
    .join('\n');

  // Format broadcast time if provided
  const broadcastTimeInfo = ctx.referenceTime
    ? `\n\nBROADCAST TIME: ${new Date(ctx.referenceTime).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
      })} (Year ${year})\nThis is the current date and time in your world.`
    : '';

  return `${RADIO_2525_SYSTEM_PROMPT}

---

You are writing a panel discussion script for AI Radio ${year}, broadcasting from the year ${year}.${broadcastTimeInfo}

HOST/MODERATOR: ${ctx.host.name}
Personality: ${ctx.host.personality}

PANELISTS:
${panelists}

TOPIC: ${ctx.topic}

CONTEXT & RESEARCH:
${ctx.retrievedContext}

TARGET DURATION: ${Math.floor(ctx.duration / 60)} minutes

TONE: ${ctx.tone}

INSTRUCTIONS:
1. Write a dynamic panel discussion with multiple perspectives
2. The host moderates and asks questions that spark discussion
3. Panelists respond to both the host and each other
4. Include natural disagreements, agreements, and building on ideas
5. Each panelist should have a distinct voice and perspective
6. Keep individual turns brief (1-3 sentences) for dynamic pacing
7. Ensure all panelists participate roughly equally
8. Incorporate ${year} world details naturally
9. Show expertise through specific examples and insights
10. Create moments of friendly debate and intellectual exchange
${getStyleGuideRules()}

FORMAT:
HOST: [dialogue]

[PANELIST_NAME]: [dialogue]

[PANELIST_NAME]: [dialogue]

etc.

Begin the panel discussion now:`;
}

/**
 * Debate prompt template
 */
export function createDebatePrompt(ctx: ConversationContext): string {
  const year = ctx.futureYear || 2525;

  // Format broadcast time if provided
  const broadcastTimeInfo = ctx.referenceTime
    ? `\n\nBROADCAST TIME: ${new Date(ctx.referenceTime).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
      })} (Year ${year})\nThis is the current date and time in your world.`
    : '';

  return `${RADIO_2525_SYSTEM_PROMPT}

---

You are writing a debate script for AI Radio ${year}, broadcasting from the year ${year}.${broadcastTimeInfo}

MODERATOR: ${ctx.host.name}

DEBATERS:
${ctx.participants.map(p => `- ${p.name}: ${p.expertise}`).join('\n')}

TOPIC: ${ctx.topic}

CONTEXT:
${ctx.retrievedContext}

TARGET DURATION: ${Math.floor(ctx.duration / 60)} minutes

INSTRUCTIONS:
1. Write a respectful but energetic debate
2. Each side presents arguments with evidence
3. Include rebuttals and counter-arguments
4. The moderator keeps discussion on track
5. Debaters address each other's points directly
6. Maintain civility while showing passion
7. Draw from ${year} world context for examples
8. Each turn should be substantive but concise
9. Build tension and release through the arc
10. Conclude with final statements
${getStyleGuideRules()}

Begin the debate now:`;
}

/**
 * Dialogue (two DJs chatting) prompt template
 */
export function createDialoguePrompt(ctx: ConversationContext): string {
  const year = ctx.futureYear || 2525;

  // Format broadcast time if provided
  const broadcastTimeInfo = ctx.referenceTime
    ? `\n\nBROADCAST TIME: ${new Date(ctx.referenceTime).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
      })} (Year ${year})\nThis is the current date and time in your world.`
    : '';

  return `${RADIO_2525_SYSTEM_PROMPT}

---

You are writing a casual conversation between two radio DJs for AI Radio ${year}, broadcasting from the year ${year}.${broadcastTimeInfo}

DJ 1: ${ctx.host.name}
Personality: ${ctx.host.personality}

DJ 2: ${ctx.participants[0].name}
Personality: ${ctx.participants[0].background}

TOPIC: ${ctx.topic}

CONTEXT:
${ctx.retrievedContext}

TARGET DURATION: ${Math.floor(ctx.duration / 60)} minutes

TONE: Conversational, friendly, informative but casual

INSTRUCTIONS:
1. Write a natural, friendly conversation between the two DJs
2. They discuss the topic while bantering and showing their personalities
3. Include humor, personal anecdotes, and relatability
4. Keep energy high with back-and-forth exchanges
5. Stay informative while being entertaining
6. Reference life in ${year} casually
7. Show their friendship/rapport
8. Each turn should be 1-3 sentences
9. Natural interruptions and finishing each other's thoughts are good
10. Make listeners feel like they're eavesdropping on friends chatting
${getStyleGuideRules()}

Begin the conversation now:`;
}
