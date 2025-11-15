import type { InterviewFormat } from '@radio/core';

/**
 * Standard in-depth interview format
 */
export const STANDARD_INTERVIEW: InterviewFormat = {
  name: 'Standard Interview',
  description: 'In-depth conversation with expert guest',
  duration: 600, // 10 minutes
  structure: [
    {
      section: 'Introduction',
      durationPct: 0.15,
      questions: 2,
    },
    {
      section: 'Background & Context',
      durationPct: 0.25,
      questions: 3,
    },
    {
      section: 'Deep Dive',
      durationPct: 0.45,
      questions: 4,
    },
    {
      section: 'Future Outlook & Closing',
      durationPct: 0.15,
      questions: 2,
    },
  ],
};

/**
 * Quick interview format for news segments
 */
export const NEWS_INTERVIEW: InterviewFormat = {
  name: 'News Interview',
  description: 'Brief interview focused on breaking news',
  duration: 180, // 3 minutes
  structure: [
    {
      section: 'Breaking News Context',
      durationPct: 0.20,
      questions: 1,
    },
    {
      section: 'Key Facts',
      durationPct: 0.50,
      questions: 3,
    },
    {
      section: 'Implications',
      durationPct: 0.30,
      questions: 2,
    },
  ],
};

/**
 * Feature interview for culture segments
 */
export const FEATURE_INTERVIEW: InterviewFormat = {
  name: 'Feature Interview',
  description: 'Relaxed, story-driven conversation',
  duration: 900, // 15 minutes
  structure: [
    {
      section: 'Personal Story',
      durationPct: 0.30,
      questions: 3,
    },
    {
      section: 'Creative Process',
      durationPct: 0.35,
      questions: 4,
    },
    {
      section: 'Vision & Philosophy',
      durationPct: 0.25,
      questions: 3,
    },
    {
      section: 'Closing',
      durationPct: 0.10,
      questions: 1,
    },
  ],
};

export const INTERVIEW_FORMATS: Record<string, InterviewFormat> = {
  standard: STANDARD_INTERVIEW,
  news: NEWS_INTERVIEW,
  feature: FEATURE_INTERVIEW,
};
