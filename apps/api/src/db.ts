import { createClient, SupabaseClient } from '@supabase/supabase-js';

let dbInstance: SupabaseClient | null = null;

/**
 * Get Supabase database client
 */
export function getDb(): SupabaseClient {
  if (!dbInstance) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    dbInstance = createClient(supabaseUrl, supabaseKey);
  }

  return dbInstance;
}
