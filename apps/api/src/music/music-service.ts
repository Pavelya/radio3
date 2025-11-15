import { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@radio/core';
import type { MusicTrack, Jingle, SoundEffect, NextTrackOptions } from '@radio/core';

const logger = createLogger('music-service');

export class MusicService {
  private db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  /**
   * Get next music track based on context
   */
  async getNextTrack(options: NextTrackOptions = {}): Promise<MusicTrack | null> {
    const {
      mood,
      time_of_day,
      program_type,
      exclude_recent_hours = 4
    } = options;

    try {
      // Build query
      let query = this.db
        .from('music_tracks')
        .select('*')
        .eq('active', true)
        .eq('reviewed', true);

      // Filter by mood
      if (mood) {
        query = query.eq('mood', mood);
      }

      // Filter by time of day
      if (time_of_day) {
        query = query.contains('suitable_for_time', [time_of_day]);
      }

      // Filter by program type
      if (program_type) {
        query = query.contains('suitable_for_programs', [program_type]);
      }

      // Exclude recently played
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - exclude_recent_hours);
      query = query.or(`last_played_at.is.null,last_played_at.lt.${cutoffTime.toISOString()}`);

      // Order by least played, limit pool
      query = query.order('play_count', { ascending: true }).limit(20);

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to fetch tracks');
        return null;
      }

      if (!data || data.length === 0) {
        return null;
      }

      // Pick random from pool for variety
      const track = data[Math.floor(Math.random() * data.length)];

      // Increment play count
      await this.db.rpc('increment_music_play_count', {
        track_id_param: track.id
      });

      return track as MusicTrack;
    } catch (error) {
      logger.error({ error }, 'Error in getNextTrack');
      return null;
    }
  }

  /**
   * Get appropriate jingle
   */
  async getJingle(
    jingleType: string,
    programId?: string
  ): Promise<Jingle | null> {
    try {
      // Try program-specific first
      if (programId) {
        const { data, error } = await this.db
          .from('jingles')
          .select('*')
          .eq('active', true)
          .eq('jingle_type', jingleType)
          .eq('program_id', programId)
          .limit(5);

        if (!error && data && data.length > 0) {
          const jingle = data[Math.floor(Math.random() * data.length)];

          await this.db.rpc('increment_jingle_play_count', {
            jingle_id_param: jingle.id
          });

          return jingle as Jingle;
        }
      }

      // Fallback to generic jingles
      const { data, error } = await this.db
        .from('jingles')
        .select('*')
        .eq('active', true)
        .eq('jingle_type', jingleType)
        .is('program_id', null)
        .limit(5);

      if (error || !data || data.length === 0) {
        logger.error({ error }, 'Failed to fetch jingle');
        return null;
      }

      const jingle = data[Math.floor(Math.random() * data.length)];

      await this.db.rpc('increment_jingle_play_count', {
        jingle_id_param: jingle.id
      });

      return jingle as Jingle;
    } catch (error) {
      logger.error({ error }, 'Error in getJingle');
      return null;
    }
  }

  /**
   * Get sound effect by category and tags
   */
  async getSoundEffect(
    category: string,
    tags?: string[]
  ): Promise<SoundEffect | null> {
    try {
      let query = this.db
        .from('sound_effects')
        .select('*')
        .eq('active', true)
        .eq('category', category);

      if (tags && tags.length > 0) {
        query = query.overlaps('tags', tags);
      }

      query = query.limit(10);

      const { data, error } = await query;

      if (error || !data || data.length === 0) {
        logger.error({ error }, 'Failed to fetch sound effect');
        return null;
      }

      return data[Math.floor(Math.random() * data.length)] as SoundEffect;
    } catch (error) {
      logger.error({ error }, 'Error in getSoundEffect');
      return null;
    }
  }

  /**
   * Add new music track
   */
  async addTrack(trackData: Partial<MusicTrack>): Promise<MusicTrack | null> {
    try {
      const { data, error } = await this.db
        .from('music_tracks')
        .insert(trackData)
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to add track');
        return null;
      }

      return data as MusicTrack;
    } catch (error) {
      logger.error({ error }, 'Error in addTrack');
      return null;
    }
  }

  /**
   * Get all tracks in a playlist
   */
  async getPlaylistTracks(playlistId: string): Promise<any[]> {
    try {
      const { data, error } = await this.db
        .from('playlist_tracks')
        .select('*, music_tracks(*)')
        .eq('playlist_id', playlistId)
        .order('position');

      if (error) {
        logger.error({ error }, 'Failed to fetch playlist tracks');
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error({ error }, 'Error in getPlaylistTracks');
      return [];
    }
  }

  /**
   * List all tracks with optional filters
   */
  async listTracks(filters: {
    genre_id?: string;
    mood?: string;
    active_only?: boolean;
  } = {}): Promise<MusicTrack[]> {
    try {
      let query = this.db
        .from('music_tracks')
        .select('*, music_genres(name)');

      if (filters.active_only !== false) {
        query = query.eq('active', true);
      }

      if (filters.genre_id) {
        query = query.eq('genre_id', filters.genre_id);
      }

      if (filters.mood) {
        query = query.eq('mood', filters.mood);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to list tracks');
        return [];
      }

      return (data || []) as MusicTrack[];
    } catch (error) {
      logger.error({ error }, 'Error in listTracks');
      return [];
    }
  }

  /**
   * List all genres
   */
  async listGenres(): Promise<any[]> {
    try {
      const { data, error } = await this.db
        .from('music_genres')
        .select('*')
        .order('name');

      if (error) {
        logger.error({ error }, 'Failed to list genres');
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error({ error }, 'Error in listGenres');
      return [];
    }
  }
}
