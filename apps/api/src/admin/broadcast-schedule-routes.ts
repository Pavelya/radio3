import { Router, type Router as ExpressRouter } from 'express';
import { getDb } from '../db';
import { createLogger } from '@radio/core';

const logger = createLogger('broadcast-schedule-routes');
const router: ExpressRouter = Router();

interface ScheduleSlot {
  id?: string;
  program_id: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  priority?: number;
  active?: boolean;
}

/**
 * GET /admin/broadcast-schedule
 * Get full broadcast schedule
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const dayOfWeek = req.query.day_of_week ? parseInt(req.query.day_of_week as string) : null;

    let query = db
      .from('broadcast_schedule')
      .select(`
        *,
        program:programs(
          id,
          name,
          dj:djs!fk_programs_dj(name),
          format_clock:format_clocks!fk_programs_format_clock(name)
        )
      `)
      .order('start_time');

    if (dayOfWeek !== null) {
      // Get slots for specific day OR slots that apply to all days
      query = query.or(`day_of_week.eq.${dayOfWeek},day_of_week.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error }, 'Failed to fetch schedule');
      return res.status(500).json({ error: 'Failed to fetch schedule' });
    }

    res.json({ schedule: data });
  } catch (error) {
    logger.error({ error }, 'Schedule fetch error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/broadcast-schedule/grid
 * Get schedule organized as weekly grid
 */
router.get('/grid', async (req, res) => {
  try {
    const db = getDb();

    const { data, error } = await db
      .from('broadcast_schedule')
      .select(`
        *,
        program:programs(
          id,
          name,
          dj:djs!fk_programs_dj(name),
          format_clock:format_clocks!fk_programs_format_clock(name)
        )
      `)
      .order('start_time');

    if (error) {
      logger.error({ error }, 'Failed to fetch schedule grid');
      return res.status(500).json({ error: 'Failed to fetch schedule grid' });
    }

    // Organize by day
    const grid: Record<string, any[]> = {
      '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [],
      'all_days': []
    };

    for (const slot of data || []) {
      const day = slot.day_of_week;
      if (day === null) {
        grid['all_days'].push(slot);
      } else {
        grid[day.toString()].push(slot);
      }
    }

    res.json({ grid });
  } catch (error) {
    logger.error({ error }, 'Schedule grid fetch error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/broadcast-schedule
 * Create new schedule slot with conflict detection
 */
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const slot: ScheduleSlot = req.body;

    // Validate
    if (!slot.program_id || !slot.start_time || !slot.end_time) {
      return res.status(400).json({
        error: 'program_id, start_time, and end_time are required'
      });
    }

    if (slot.day_of_week !== null && (slot.day_of_week < 0 || slot.day_of_week > 6)) {
      return res.status(400).json({
        error: 'day_of_week must be 0-6 or null'
      });
    }

    // Check for conflicts
    const { data: conflicts, error: conflictError } = await db.rpc('check_schedule_conflicts', {
      p_day_of_week: slot.day_of_week,
      p_start_time: slot.start_time,
      p_end_time: slot.end_time,
      p_exclude_id: null
    });

    if (conflictError) {
      logger.error({ error: conflictError }, 'Conflict check failed');
    }

    if (conflicts && conflicts.length > 0) {
      return res.json({
        conflicts,
        message: 'Schedule conflicts detected. Set higher priority to override.'
      });
    }

    // Insert schedule slot
    const { data, error } = await db
      .from('broadcast_schedule')
      .insert({
        program_id: slot.program_id,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        priority: slot.priority || 0,
        active: slot.active !== undefined ? slot.active : true
      })
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to create schedule slot');
      return res.status(500).json({ error: 'Failed to create schedule slot' });
    }

    res.json({ schedule_slot: data });
  } catch (error) {
    logger.error({ error }, 'Schedule slot creation error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /admin/broadcast-schedule/:slot_id
 * Update schedule slot
 */
router.patch('/:slot_id', async (req, res) => {
  try {
    const db = getDb();
    const { slot_id } = req.params;
    const updates = req.body;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data, error } = await db
      .from('broadcast_schedule')
      .update(updates)
      .eq('id', slot_id)
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to update schedule slot');
      return res.status(404).json({ error: 'Schedule slot not found' });
    }

    res.json({ schedule_slot: data });
  } catch (error) {
    logger.error({ error }, 'Schedule slot update error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /admin/broadcast-schedule/:slot_id
 * Delete schedule slot
 */
router.delete('/:slot_id', async (req, res) => {
  try {
    const db = getDb();
    const { slot_id } = req.params;

    const { data, error } = await db
      .from('broadcast_schedule')
      .delete()
      .eq('id', slot_id)
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to delete schedule slot');
      return res.status(404).json({ error: 'Schedule slot not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Schedule slot deletion error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as broadcastScheduleRouter };
