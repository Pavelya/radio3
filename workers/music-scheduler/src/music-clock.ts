import { createClient } from '@supabase/supabase-js';
import { addMinutes, format, getHours } from 'date-fns';
import { createLogger } from '@radio/core/logger';

const logger = createLogger('music-clock');

interface MusicClockSegment {
  minute: number;
  type: 'talk' | 'music' | 'station_id';
  duration: number;
}

interface TimeSlotConfig {
  timeRange: string;
  segments: MusicClockSegment[];
  musicMood: string;
  musicTempo: string;
}

/**
 * Music clock scheduler
 * Determines when to play music vs talk based on time of day
 */
export class MusicClock {
  private db;
  private config: Record<string, TimeSlotConfig>;

  constructor() {
    this.db = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Load music clock config
    this.config = {
      morning: {
        timeRange: '06:00-12:00',
        segments: [
          { minute: 0, type: 'station_id', duration: 15 },
          { minute: 0, type: 'talk', duration: 240 },
          { minute: 4, type: 'music', duration: 180 },
          { minute: 7, type: 'talk', duration: 180 },
          { minute: 10, type: 'music', duration: 180 },
        ],
        musicMood: 'energetic',
        musicTempo: 'fast',
      },
      afternoon: {
        timeRange: '12:00-18:00',
        segments: [
          { minute: 0, type: 'talk', duration: 300 },
          { minute: 5, type: 'music', duration: 240 },
          { minute: 9, type: 'talk', duration: 240 },
        ],
        musicMood: 'calm',
        musicTempo: 'medium',
      },
      evening: {
        timeRange: '18:00-23:00',
        segments: [
          { minute: 0, type: 'talk', duration: 240 },
          { minute: 4, type: 'music', duration: 300 },
        ],
        musicMood: 'calm',
        musicTempo: 'medium',
      },
      night: {
        timeRange: '23:00-06:00',
        segments: [
          { minute: 0, type: 'talk', duration: 180 },
          { minute: 3, type: 'music', duration: 300 },
        ],
        musicMood: 'ambient',
        musicTempo: 'slow',
      },
    };
  }

  /**
   * Get current time slot configuration
   */
  getCurrentTimeSlot(): TimeSlotConfig {
    const hour = getHours(new Date());

    if (hour >= 6 && hour < 12) return this.config.morning;
    if (hour >= 12 && hour < 18) return this.config.afternoon;
    if (hour >= 18 && hour < 23) return this.config.evening;
    return this.config.night;
  }

  /**
   * Should we play music right now?
   */
  shouldPlayMusic(currentTime: Date): boolean {
    const timeSlot = this.getCurrentTimeSlot();
    const currentMinute = currentTime.getMinutes();

    // Find if current minute matches a music segment
    for (const segment of timeSlot.segments) {
      if (segment.type === 'music') {
        const segmentStart = segment.minute;
        const segmentEnd = segment.minute + Math.floor(segment.duration / 60);

        if (currentMinute >= segmentStart && currentMinute < segmentEnd) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get next scheduled music slot
   */
  getNextMusicSlot(currentTime: Date): Date | null {
    const timeSlot = this.getCurrentTimeSlot();
    const currentMinute = currentTime.getMinutes();

    for (const segment of timeSlot.segments) {
      if (segment.type === 'music' && segment.minute > currentMinute) {
        return addMinutes(currentTime, segment.minute - currentMinute);
      }
    }

    // Next slot is in next hour
    return addMinutes(currentTime, 60 - currentMinute);
  }

  /**
   * Pre-download music for upcoming slots
   */
  async prefetchMusic(): Promise<void> {
    const timeSlot = this.getCurrentTimeSlot();

    logger.info({
      timeSlot: Object.keys(this.config).find(key => this.config[key] === timeSlot),
      mood: timeSlot.musicMood,
      tempo: timeSlot.musicTempo,
    }, 'Prefetching music for current time slot');

    // Fetch 5 tracks for current mood
    const { data: tracks } = await this.db
      .from('music_tracks')
      .select('*')
      .eq('active', true)
      .eq('mood', timeSlot.musicMood)
      .order('play_count', { ascending: true })
      .limit(5);

    logger.info({ count: tracks?.length }, 'Prefetched music tracks');

    // TODO: Download tracks to local cache
  }
}
