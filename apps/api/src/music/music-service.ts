import { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@radio/core';
import type { MusicTrack, Jingle, SoundEffect, NextTrackOptions } from '@radio/core';
import crypto from 'crypto';

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

  /**
   * Upload music file to storage with deduplication
   */
  async uploadMusicFile(
    fileBuffer: Buffer,
    filename: string,
    contentType: string
  ): Promise<{ storagePath: string; fileHash: string; isDuplicate: boolean; existingTrack?: any }> {
    try {
      // Calculate content hash for deduplication
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // Check for duplicates
      const { data: existing } = await this.db
        .from('music_tracks')
        .select('id, title, artist')
        .eq('file_hash', fileHash)
        .single();

      if (existing) {
        logger.info({ fileHash, existingTrack: existing }, 'Duplicate file detected');
        return {
          storagePath: '',
          fileHash,
          isDuplicate: true,
          existingTrack: existing,
        };
      }

      // Generate storage path: music/{hash_prefix}/{hash}.{ext}
      const ext = filename.split('.').pop() || 'mp3';
      const storagePath = `music/${fileHash.slice(0, 2)}/${fileHash}.${ext}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await this.db.storage
        .from('audio-assets')
        .upload(storagePath, fileBuffer, {
          contentType,
          upsert: false,
        });

      if (uploadError) {
        logger.error({ uploadError, storagePath }, 'Failed to upload file to storage');
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      logger.info({ storagePath, fileHash }, 'File uploaded successfully');

      return {
        storagePath,
        fileHash,
        isDuplicate: false,
      };
    } catch (error) {
      logger.error({ error }, 'Error in uploadMusicFile');
      throw error;
    }
  }

  /**
   * Create new track metadata
   */
  async createTrack(trackData: {
    title: string;
    artist?: string;
    album?: string;
    genre_id?: string;
    duration_sec: number;
    storage_path: string;
    file_hash: string;
    file_format?: string;
    license_type: string;
    attribution_required?: boolean;
    attribution_text?: string;
    mood?: string;
    tempo?: string;
    energy_level?: number;
    suitable_for_time?: string[];
    suitable_for_programs?: string[];
  }): Promise<MusicTrack> {
    try {
      const { data, error } = await this.db
        .from('music_tracks')
        .insert({
          ...trackData,
          active: false, // Requires review before activation
          reviewed: false,
          play_count: 0,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, trackData }, 'Failed to create track');
        throw new Error(`Failed to create track: ${error.message}`);
      }

      logger.info({ trackId: data.id, title: trackData.title }, 'Track created');

      return data as MusicTrack;
    } catch (error) {
      logger.error({ error }, 'Error in createTrack');
      throw error;
    }
  }

  /**
   * Get track by ID with signed audio URL
   */
  async getTrackById(id: string): Promise<MusicTrack | null> {
    try {
      const { data, error } = await this.db
        .from('music_tracks')
        .select('*, genre:music_genres(id, name)')
        .eq('id', id)
        .single();

      if (error) {
        logger.error({ error, trackId: id }, 'Track not found');
        throw new Error(`Track not found: ${error.message}`);
      }

      // Generate signed URL for audio playback
      if (data.storage_path) {
        const { data: signedUrl } = await this.db.storage
          .from('audio-assets')
          .createSignedUrl(data.storage_path, 3600); // 1 hour

        (data as any).audio_url = signedUrl?.signedUrl || null;
      }

      return data as MusicTrack;
    } catch (error) {
      logger.error({ error }, 'Error in getTrackById');
      return null;
    }
  }

  /**
   * Update track metadata
   */
  async updateTrack(id: string, updates: Partial<{
    title: string;
    artist: string;
    album: string;
    genre_id: string;
    mood: string;
    tempo: string;
    energy_level: number;
    license_type: string;
    attribution_required: boolean;
    attribution_text: string;
    suitable_for_time: string[];
    suitable_for_programs: string[];
    active: boolean;
    reviewed: boolean;
  }>): Promise<MusicTrack> {
    try {
      const { data, error } = await this.db
        .from('music_tracks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error({ error, trackId: id, updates }, 'Failed to update track');
        throw new Error(`Failed to update track: ${error.message}`);
      }

      logger.info({ trackId: id, updates }, 'Track updated');

      return data as MusicTrack;
    } catch (error) {
      logger.error({ error }, 'Error in updateTrack');
      throw error;
    }
  }

  /**
   * Delete track and its storage file
   */
  async deleteTrack(id: string): Promise<{ success: boolean }> {
    try {
      // Get track info first
      const track = await this.getTrackById(id);

      if (!track) {
        throw new Error('Track not found');
      }

      // Delete file from storage
      if (track.storage_path) {
        const { error: storageError } = await this.db.storage
          .from('audio-assets')
          .remove([track.storage_path]);

        if (storageError) {
          logger.error({ storageError, storagePath: track.storage_path }, 'Failed to delete storage file');
          // Continue with DB deletion even if storage fails
        }
      }

      // Delete database record
      const { error } = await this.db
        .from('music_tracks')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error({ error, trackId: id }, 'Failed to delete track');
        throw new Error(`Failed to delete track: ${error.message}`);
      }

      logger.info({ trackId: id, title: track.title }, 'Track deleted');

      return { success: true };
    } catch (error) {
      logger.error({ error }, 'Error in deleteTrack');
      throw error;
    }
  }
}
