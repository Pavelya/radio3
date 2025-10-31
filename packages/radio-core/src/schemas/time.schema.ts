import { z } from 'zod';

/**
 * Current time schema - time mapping response
 */
export const currentTimeSchema = z.object({
  real_utc: z.string().datetime().describe('Real UTC time'),
  local: z.string().datetime().describe('Local time in station timezone'),
  future_display: z.string().datetime().describe('Displayed future time (with offset)'),
  station_timezone: z.string().describe('Station timezone'),
  year_offset: z.number().int().describe('Year offset applied')
});

export type CurrentTime = z.infer<typeof currentTimeSchema>;

/**
 * NTP skew schema - time synchronization check
 */
export const ntpSkewSchema = z.object({
  skew_ms: z.number().nullable().optional().describe('Time skew in milliseconds'),
  healthy: z.boolean().describe('Is time sync healthy'),
  ntp_server: z.string().nullable().optional().describe('NTP server used'),
  error: z.string().nullable().optional().describe('Error message if unhealthy')
});

export type NTPSkew = z.infer<typeof ntpSkewSchema>;