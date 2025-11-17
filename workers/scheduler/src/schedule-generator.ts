import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { addHours, addMinutes, startOfDay, addDays, format, getDay } from 'date-fns';
import { createLogger } from '@radio/core';

const logger = createLogger('schedule-generator');

interface FormatSlot {
  id: string;
  format_clock_id: string;
  slot_type: string;
  duration_sec: number;
  order_index: number;
  required: boolean;
}

interface FormatClock {
  id: string;
  name: string;
  description: string;
  format_slots?: FormatSlot[];
}

interface ProgramWithFormatClock {
  id: string;
  name: string;
  dj_id: string;
  format_clock_id: string;
  conversation_format?: string | null;
  program_djs?: Array<{ dj_id: string; role: string; speaking_order: number }>;
  format_clocks: FormatClock[] | FormatClock | null;
}

interface BroadcastSchedule {
  id: string;
  program_id: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  priority: number;
}

/**
 * Schedule generator
 * Creates daily broadcast schedules
 */
export class ScheduleGenerator {
  private db: SupabaseClient;
  private readonly futureYearOffset: number;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
    this.futureYearOffset = parseInt(process.env.FUTURE_YEAR_OFFSET || '500');

    logger.info({ futureYearOffset: this.futureYearOffset }, 'Schedule generator initialized');
  }

  /**
   * Generate schedule for a specific date
   */
  async generateScheduleForDate(date: Date): Promise<void> {
    logger.info({ date: format(date, 'yyyy-MM-dd') }, 'Generating schedule');

    try {
      // Fetch active programs with format clocks and DJs
      const { data: programs, error: programsError } = await this.db
        .from('programs')
        .select(`
          id,
          name,
          dj_id,
          format_clock_id,
          conversation_format,
          program_djs(dj_id, role, speaking_order),
          format_clocks!fk_programs_format_clock(id, name, description)
        `)
        .eq('active', true);

      if (programsError) throw programsError;

      if (!programs || programs.length === 0) {
        logger.warn('No active programs found');
        return;
      }

      // Fetch broadcast schedule
      const { data: broadcastSchedule, error: scheduleError } = await this.db
        .from('broadcast_schedule')
        .select('*')
        .eq('active', true)
        .order('priority', { ascending: false });

      if (scheduleError) throw scheduleError;

      // Get day of week (0 = Sunday, 6 = Saturday)
      const dayOfWeek = getDay(date);

      logger.info({
        dayOfWeek,
        schedules: broadcastSchedule?.length || 0
      }, 'Broadcast schedule loaded');

      // Generate segments for each hour of the day
      const segmentsToCreate = [];
      const programsMap = new Map<string, ProgramWithFormatClock>();
      const formatSlotsCache = new Map<string, FormatSlot[]>();

      // Build programs map for quick lookup
      for (const prog of programs as ProgramWithFormatClock[]) {
        programsMap.set(prog.id, prog);
      }

      for (let hour = 0; hour < 24; hour++) {
        const hourStart = addHours(startOfDay(date), hour);

        // Determine which program should air during this hour
        const program = this.getProgramForHour(
          hour,
          dayOfWeek,
          broadcastSchedule as BroadcastSchedule[] || [],
          programs as ProgramWithFormatClock[]
        );

        if (!program) {
          logger.warn({ hour }, 'No program found for hour, skipping');
          continue;
        }

        // Fetch format slots for this program's format clock (with caching)
        let formatSlots = formatSlotsCache.get(program.format_clock_id);

        if (!formatSlots) {
          const { data: slots, error: slotsError } = await this.db
            .from('format_slots')
            .select('*')
            .eq('format_clock_id', program.format_clock_id)
            .order('order_index', { ascending: true });

          if (slotsError) {
            logger.error({ error: slotsError, formatClockId: program.format_clock_id }, 'Failed to fetch format slots');
            continue;
          }

          if (!slots || slots.length === 0) {
            logger.warn({ formatClockId: program.format_clock_id }, 'No format slots found for format clock');
            continue;
          }

          formatSlots = slots as FormatSlot[];
          formatSlotsCache.set(program.format_clock_id, formatSlots);
        }

        // Generate segments for this hour
        let currentMinute = 0;

        for (const slot of formatSlots) {
          const slotStart = addMinutes(hourStart, currentMinute);

          // Convert to future year (2525)
          const futureSlotStart = this.toFutureYear(slotStart);

          // Determine participant count from program_djs
          const programDjs = program.program_djs || [];
          const participantCount = programDjs.length || 1;

          // Create segment
          const segment = {
            program_id: program.id,
            slot_type: slot.slot_type,
            conversation_format: program.conversation_format || null,
            participant_count: participantCount,
            lang: 'en',
            state: 'queued',
            scheduled_start_ts: futureSlotStart.toISOString(),
            max_retries: 3,
            retry_count: 0
          };

          segmentsToCreate.push(segment);

          // Advance to next slot (duration in seconds, convert to minutes)
          currentMinute += Math.ceil(slot.duration_sec / 60);
        }
      }

      logger.info({
        date: format(date, 'yyyy-MM-dd'),
        segments: segmentsToCreate.length
      }, 'Creating segments');

      // Batch insert segments
      const { data: insertedSegments, error: insertError } = await this.db
        .from('segments')
        .insert(segmentsToCreate)
        .select();

      if (insertError) throw insertError;

      logger.info({
        created: insertedSegments?.length || 0
      }, 'Segments created');

      // Enqueue generation jobs for each segment
      for (const segment of insertedSegments || []) {
        await this.enqueueGenerationJob(segment.id);
      }

      logger.info({
        date: format(date, 'yyyy-MM-dd'),
        segments: insertedSegments?.length || 0
      }, 'Schedule generation complete');

    } catch (error) {
      logger.error({ error, date }, 'Schedule generation failed');
      throw error;
    }
  }

  /**
   * Generate schedule for tomorrow
   */
  async generateTomorrowSchedule(): Promise<void> {
    const tomorrow = addDays(new Date(), 1);
    await this.generateScheduleForDate(tomorrow);
  }

  /**
   * Enqueue segment generation job
   */
  private async enqueueGenerationJob(segmentId: string): Promise<void> {
    const { error } = await this.db.rpc('enqueue_job', {
      p_job_type: 'segment_make',
      p_payload: { segment_id: segmentId },
      p_priority: 5,
      p_schedule_delay_sec: 0
    });

    if (error) {
      logger.error({ error, segmentId }, 'Failed to enqueue generation job');
      throw error;
    }
  }

  /**
   * Determine which program should air during a specific hour
   * Based on broadcast schedule configuration
   */
  private getProgramForHour(
    hour: number,
    dayOfWeek: number,
    broadcastSchedule: BroadcastSchedule[],
    programs: ProgramWithFormatClock[]
  ): ProgramWithFormatClock | null {
    // Convert hour to time string (HH:00:00)
    const hourTime = `${hour.toString().padStart(2, '0')}:00:00`;

    // Find matching broadcast schedule entry (highest priority wins)
    const matchingSchedule = broadcastSchedule.find(schedule => {
      // Check if day matches (NULL = every day)
      const dayMatches = schedule.day_of_week === null || schedule.day_of_week === dayOfWeek;

      if (!dayMatches) return false;

      // Check if hour falls within time range
      const startHour = parseInt(schedule.start_time.split(':')[0]);
      const endHour = parseInt(schedule.end_time.split(':')[0]);

      // Handle midnight-crossing schedules (e.g., 22:00 - 02:00)
      if (endHour <= startHour) {
        // Crosses midnight
        return hour >= startHour || hour < endHour;
      } else {
        // Normal range
        return hour >= startHour && hour < endHour;
      }
    });

    if (matchingSchedule) {
      // Find the program for this schedule entry
      return programs.find(p => p.id === matchingSchedule.program_id) || null;
    }

    // No matching schedule - use first active program as fallback
    logger.debug({ hour }, 'No broadcast schedule match, using fallback program');
    return programs[0] || null;
  }

  /**
   * Convert date to future year (2525)
   */
  private toFutureYear(date: Date): Date {
    const futureDate = new Date(date);
    futureDate.setFullYear(date.getFullYear() + this.futureYearOffset);
    return futureDate;
  }

  /**
   * Check how many ready segments exist for tomorrow
   */
  async checkTomorrowReadiness(): Promise<{
    total: number;
    ready: number;
    percentage: number;
  }> {
    const tomorrow = addDays(new Date(), 1);
    const tomorrowStart = this.toFutureYear(startOfDay(tomorrow));
    const tomorrowEnd = this.toFutureYear(addDays(startOfDay(tomorrow), 1));

    const { data: segments, error } = await this.db
      .from('segments')
      .select('state')
      .gte('scheduled_start_ts', tomorrowStart.toISOString())
      .lt('scheduled_start_ts', tomorrowEnd.toISOString());

    if (error) throw error;

    const total = segments?.length || 0;
    const ready = segments?.filter(s => s.state === 'ready').length || 0;
    const percentage = total > 0 ? (ready / total) * 100 : 0;

    return { total, ready, percentage };
  }
}
