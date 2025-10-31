import { z } from 'zod';

/**
 * DJ schema - AI persona definitions
 */
export const djSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique DJ identifier'),
  name: z.string().min(1).describe('DJ name'),
  
  // Voice configuration
  voice_id: z.string().uuid().describe('Voice model reference'),
  lang: z.string().length(2).default('en').describe('Primary language'),
  
  // Persona
  bio: z.string().nullable().optional().describe('DJ biography in Markdown'),
  personality_traits: z.array(z.string()).default([]).describe('Personality traits'),
  
  // Visuals
  avatar_url: z.string().url().nullable().optional().describe('Avatar image URL'),
  
  // Style
  stylebook_id: z.string().uuid().nullable().optional().describe('Writing style reference'),
  
  // Metadata
  metadata: z.record(z.unknown()).nullable().optional().describe('Additional config'),
  
  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp'),
  updated_at: z.string().datetime().describe('Last update timestamp')
});

export type DJ = z.infer<typeof djSchema>;