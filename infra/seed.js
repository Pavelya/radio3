#!/usr/bin/env node
/**
 * Database seeding script
 * Populates database with initial sample data
 *
 * Usage:
 *   node infra/seed.js
 */

const { createClient } = require('@supabase/supabase-js');
const { createLogger } = require('../packages/radio-core/dist/index.js');
const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config();

const logger = createLogger('seed-script');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  logger.info('Starting database seeding');

  try {
    // 1. Seed Format Clocks
    logger.info('Seeding format clocks');
    const formatClocksData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'seed-data/format-clocks.json'), 'utf8')
    );

    for (const clock of formatClocksData) {
      const { slots, ...clockData } = clock;

      // Insert format clock (upsert to make idempotent)
      const { data: insertedClock, error: clockError } = await supabase
        .from('format_clocks')
        .upsert(
          {
            id: clockData.id,
            name: clockData.name,
            description: clockData.description,
          },
          { onConflict: 'id' }
        )
        .select()
        .single();

      if (clockError) {
        logger.error({ clock: clockData.name, error: clockError.message }, 'Error inserting clock');
        continue;
      }

      logger.info({ clock: clockData.name }, 'Created/updated format clock');

      // Delete existing slots for this clock to avoid duplicates
      await supabase
        .from('format_slots')
        .delete()
        .eq('format_clock_id', insertedClock.id);

      // Insert slots
      for (const slot of slots) {
        const { error: slotError } = await supabase.from('format_slots').insert({
          format_clock_id: insertedClock.id,
          slot_type: slot.slot_type,
          duration_sec: slot.duration_sec,
          order_index: slot.order_index,
        });

        if (slotError) {
          logger.error({ error: slotError.message }, 'Error inserting slot');
        }
      }
      logger.info({ clock: clockData.name, slotCount: slots.length }, 'Added slots');
    }

    // 2. Seed DJs (Note: DJ table created in A4, might not exist yet)
    logger.info('Seeding DJs');
    const djsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'seed-data/djs.json'), 'utf8')
    );

    // Check if djs table exists
    const { error: djCheckError } = await supabase
      .from('djs')
      .select('id')
      .limit(1);

    if (djCheckError && djCheckError.code === '42P01') {
      logger.warn('DJs table does not exist yet (created in A4). Skipping DJ seeding');
    } else {
      for (const dj of djsData) {
        const { error } = await supabase
          .from('djs')
          .upsert(dj, { onConflict: 'id' });

        if (error) {
          logger.error({ dj: dj.name, error: error.message }, 'Error inserting DJ');
        } else {
          logger.info({ dj: dj.name }, 'Created/updated DJ');
        }
      }
    }

    // 3. Seed Programs
    logger.info('Seeding programs');
    const programsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'seed-data/programs.json'), 'utf8')
    );

    for (const program of programsData) {
      const { error } = await supabase
        .from('programs')
        .upsert(program, { onConflict: 'id' });

      if (error) {
        logger.error({ program: program.name, error: error.message }, 'Error inserting program');
      } else {
        logger.info({ program: program.name }, 'Created/updated program');
      }
    }

    // 4. Seed Universe Docs
    logger.info('Seeding universe lore');
    const universeDocsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'seed-data/universe-docs.json'), 'utf8')
    );

    const universeDocIds = [];

    for (const doc of universeDocsData) {
      // Check if document with this title already exists
      const { data: existing } = await supabase
        .from('universe_docs')
        .select('id')
        .eq('title', doc.title)
        .single();

      if (existing) {
        // Update existing document
        const { error } = await supabase
          .from('universe_docs')
          .update(doc)
          .eq('id', existing.id);

        if (error) {
          logger.error({ doc: doc.title, error: error.message }, 'Error updating doc');
        } else {
          logger.info({ doc: doc.title }, 'Updated lore doc');
          universeDocIds.push(existing.id);
        }
      } else {
        // Insert new document
        const { data: inserted, error } = await supabase
          .from('universe_docs')
          .insert(doc)
          .select('id')
          .single();

        if (error) {
          logger.error({ doc: doc.title, error: error.message }, 'Error inserting doc');
        } else {
          logger.info({ doc: doc.title }, 'Created lore doc');
          if (inserted) universeDocIds.push(inserted.id);
        }
      }
    }

    // Enqueue embedding jobs for universe docs
    logger.info({ count: universeDocIds.length }, 'Enqueuing embedding jobs for universe docs');
    for (const docId of universeDocIds) {
      const { error } = await supabase.rpc('enqueue_job', {
        p_job_type: 'kb_index',
        p_payload: {
          source_type: 'universe_doc',
          source_id: docId
        },
        p_priority: 3,
        p_schedule_delay_sec: 0
      });

      if (error) {
        logger.error({ docId, error: error.message }, 'Failed to enqueue embedding job');
      }
    }

    // 5. Seed Events
    logger.info('Seeding current events');
    const eventsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'seed-data/events.json'), 'utf8')
    );

    const eventIds = [];

    for (const event of eventsData) {
      // Check if event with this title already exists
      const { data: existing } = await supabase
        .from('events')
        .select('id')
        .eq('title', event.title)
        .single();

      if (existing) {
        // Update existing event
        const { error } = await supabase
          .from('events')
          .update(event)
          .eq('id', existing.id);

        if (error) {
          logger.error({ event: event.title, error: error.message }, 'Error updating event');
        } else {
          logger.info({ event: event.title }, 'Updated event');
          eventIds.push(existing.id);
        }
      } else {
        // Insert new event
        const { data: inserted, error } = await supabase
          .from('events')
          .insert(event)
          .select('id')
          .single();

        if (error) {
          logger.error({ event: event.title, error: error.message }, 'Error inserting event');
        } else {
          logger.info({ event: event.title }, 'Created event');
          if (inserted) eventIds.push(inserted.id);
        }
      }
    }

    // Enqueue embedding jobs for events
    logger.info({ count: eventIds.length }, 'Enqueuing embedding jobs for events');
    for (const eventId of eventIds) {
      const { error } = await supabase.rpc('enqueue_job', {
        p_job_type: 'kb_index',
        p_payload: {
          source_type: 'event',
          source_id: eventId
        },
        p_priority: 3,
        p_schedule_delay_sec: 0
      });

      if (error) {
        logger.error({ eventId, error: error.message }, 'Failed to enqueue embedding job');
      }
    }

    logger.info({
      formatClocks: formatClocksData.length,
      djs: djsData.length,
      programs: programsData.length,
      universeDocs: universeDocsData.length,
      universeDocsEmbeddingJobs: universeDocIds.length,
      events: eventsData.length,
      eventsEmbeddingJobs: eventIds.length
    }, 'Database seeding completed successfully');

    logger.info('Note: Embeddings will be generated asynchronously by the embedder worker');

  } catch (error) {
    logger.error({ error: error.message }, 'Seeding failed');
    process.exit(1);
  }
}

seed();
