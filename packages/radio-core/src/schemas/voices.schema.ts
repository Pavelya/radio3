import { z } from 'zod';

/**
 * Voice provider enum
 */
export const voiceProviderEnum = z.enum([
  'piper',
  'google'
]);

export type VoiceProvider = z.infer<typeof voiceProviderEnum>;

/**
 * Voice schema - voice model registry with consent
 */
export const voiceSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique voice identifier'),
  name: z.string().min(1).describe('Voice name'),
  
  // Provider
  provider: voiceProviderEnum.default('piper').describe('TTS provider'),
  
  // Provider-specific
  piper_model: z.string().nullable().optional().describe('Piper model name'),
  google_voice: z.string().nullable().optional().describe('Google voice name'),
  
  // SSML capabilities
  ssml_capabilities: z.object({
    pitch_range: z.tuple([z.number(), z.number()]).nullable().optional(),
    speed_range: z.tuple([z.number(), z.number()]).nullable().optional()
  }).nullable().optional().describe('SSML support'),
  
  // Consent tracking
  consent_url: z.string().url().nullable().optional().describe('Consent document URL'),
  consent_verified_at: z.string().datetime().nullable().optional().describe('Consent verification date'),
  revoked_at: z.string().datetime().nullable().optional().describe('Consent revocation date'),
  
  // Languages
  langs: z.array(z.string()).default(['en']).describe('Supported languages'),
  
  // Metadata
  metadata: z.record(z.unknown()).nullable().optional().describe('Additional metadata'),
  
  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp')
});

export type Voice = z.infer<typeof voiceSchema>;