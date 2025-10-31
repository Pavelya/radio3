import { z } from 'zod';

/**
 * Universe document status enum
 */
export const universeDocStatusEnum = z.enum([
  'draft',
  'published',
  'archived'
]);

export type UniverseDocStatus = z.infer<typeof universeDocStatusEnum>;

/**
 * Universe document schema - canonical lore and worldbuilding
 */
export const universeDocSchema = z.object({
  // Identity
  id: z.string().uuid().describe('Unique document identifier'),
  
  // Content
  title: z.string().min(1).describe('Document title'),
  subtitle: z.string().nullable().optional().describe('Document subtitle'),
  body: z.string().min(1).describe('Document body in Markdown'),
  lang: z.string().length(2).default('en').describe('Language code'),
  
  // Classification
  category: z.string().nullable().optional().describe('Content category'),
  tags: z.array(z.string()).default([]).describe('Content tags'),
  
  // Authorship
  author: z.string().nullable().optional().describe('Author name'),
  
  // Publishing
  status: universeDocStatusEnum.default('draft').describe('Publication status'),
  published_at: z.string().datetime().nullable().optional().describe('Publication date'),
  
  // Timestamps
  created_at: z.string().datetime().describe('Creation timestamp'),
  updated_at: z.string().datetime().describe('Last update timestamp')
});

export type UniverseDoc = z.infer<typeof universeDocSchema>;