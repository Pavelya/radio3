import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { addHours, addMinutes, startOfDay, addDays, format } from 'date-fns';
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
  format_clocks: FormatClock[] | FormatClock | null;
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
      // Fetch active programs with format clocks
      const { data: programs, error: programsError } = await this.db
        .from('programs')
        .select('id, name, dj_id, format_clock_id, format_clocks!fk_programs_format_clock(id, name, description)')
        .eq('active', true);

      if (programsError) throw programsError;

      if (!programs || programs.length === 0) {
        logger.warn('No active programs found');
        return;
      }

      // For now, use first program for entire day
      // TODO: Support multiple programs per day
      const program = programs[0] as ProgramWithFormatClock;

      // Fetch format slots for this format clock
      const { data: formatSlots, error: slotsError } = await this.db
        .from('format_slots')
        .select('*')
        .eq('format_clock_id', program.format_clock_id)
        .order('order_index', { ascending: true });

      if (slotsError) throw slotsError;

      if (!formatSlots || formatSlots.length === 0) {
        logger.warn({ formatClockId: program.format_clock_id }, 'No format slots found for format clock');
        return;
      }

      // Get format clock name (handle array case from Supabase)
      const formatClockName = Array.isArray(program.format_clocks)
        ? program.format_clocks[0]?.name
        : program.format_clocks?.name;

      logger.info({
        program: program.name,
        formatClock: formatClockName,
        slots: formatSlots.length
      }, 'Using program');

      // Generate segments for each hour of the day
      const segmentsToCreate = [];
      let currentMinute = 0;

      for (let hour = 0; hour < 24; hour++) {
        const hourStart = addHours(startOfDay(date), hour);

        // Reset minute counter for each hour
        currentMinute = 0;

        for (const slot of formatSlots) {
          const slotStart = addMinutes(hourStart, currentMinute);

          // Convert to future year (2525)
          const futureSlotStart = this.toFutureYear(slotStart);

          // Create segment
          const segment = {
            program_id: program.id,
            slot_type: slot.slot_type,
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
