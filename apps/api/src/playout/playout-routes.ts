import { Router, type Router as ExpressRouter } from 'express';
import { getDb } from '../db';
import { createLogger } from '@radio/core';

const logger = createLogger('playout-routes');
const router: ExpressRouter = Router();

/**
 * Types
 */
interface PlayoutSegment {
  id: string;
  title: string;
  audio_url: string;
  duration_sec: number;
  slot_type: string;
  dj_name?: string;
}

interface PlayoutResponse {
  segments: PlayoutSegment[];
  total: number;
}

interface NowPlayingRequest {
  segment_id: string;
  title: string;
  timestamp: string;
}

interface AlertRequest {
  timestamp: string;
  type: string;
  details?: Record<string, any>;
}

/**
 * GET /playout/next
 * Get next segments ready for playout
 *
 * Returns segments in ready state with signed audio URLs
 */
router.get('/next', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 50);

    const db = getDb();

    // Fetch ready segments
    const { data: segments, error } = await db
      .from('segments')
      .select('*, assets(*), programs(name, djs(name))')
      .eq('state', 'ready')
      .order('scheduled_start_ts', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error({ error }, 'Failed to fetch segments');
      return res.status(500).json({ error: 'Failed to fetch segments' });
    }

    const playoutSegments: PlayoutSegment[] = [];

    for (const row of segments || []) {
      // Get asset
      const asset = row.assets;
      if (!asset) {
        logger.warn({ segmentId: row.id }, 'Segment has no asset, skipping');
        continue;
      }

      // Generate signed URL (1 hour expiry)
      const storage_path = asset.storage_path;

      // Storage path logic:
      // - Raw audio: {storage_path} (created by segment-gen worker)
      // - Normalized audio: final/{asset_id}.wav (created by mastering worker)
      // - We prefer the normalized version for broadcast quality
      const final_path = `final/${asset.id}.wav`;

      let audio_url: string;

      try {
        // Try final (normalized) path first
        const { data: finalSignedUrl, error: finalError } = await db.storage
          .from('audio-assets')
          .createSignedUrl(final_path, 3600);

        if (finalError || !finalSignedUrl) {
          // Fallback to raw audio if mastering not complete or failed
          logger.debug({ assetId: asset.id }, 'Final audio not found, using raw audio');

          const { data: rawSignedUrl, error: rawError } = await db.storage
            .from('audio-assets')
            .createSignedUrl(storage_path, 3600);

          if (rawError || !rawSignedUrl) {
            logger.error({ error: rawError, assetId: asset.id }, 'Failed to generate signed URL');
            continue;
          }

          audio_url = rawSignedUrl.signedUrl;
        } else {
          audio_url = finalSignedUrl.signedUrl;
        }
      } catch (e) {
        logger.error({ error: e, assetId: asset.id }, 'Error generating signed URL');
        continue;
      }

      // Build segment object
      const segment: PlayoutSegment = {
        id: row.id,
        title: `${row.programs?.name || 'Unknown'} - ${row.slot_type}`,
        audio_url,
        duration_sec: row.duration_sec || 0,
        slot_type: row.slot_type,
        dj_name: row.programs?.djs?.name
      };

      playoutSegments.push(segment);
    }

    const response: PlayoutResponse = {
      segments: playoutSegments,
      total: playoutSegments.length
    };

    res.json(response);

  } catch (error) {
    logger.error({ error }, 'Error in /playout/next');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /playout/now-playing
 * Report that a segment is now playing
 *
 * Updates segment state to 'airing' and records timestamp
 */
router.post('/now-playing', async (req, res) => {
  try {
    const request: NowPlayingRequest = req.body;

    // Validate
    if (!request.segment_id || !request.title || !request.timestamp) {
      return res.status(400).json({
        error: 'Missing required fields: segment_id, title, timestamp'
      });
    }

    const db = getDb();

    // Update segment to airing
    const { data, error } = await db
      .from('segments')
      .update({
        state: 'airing',
        aired_at: request.timestamp,
        updated_at: new Date().toISOString()
      })
      .eq('id', request.segment_id)
      .select();

    if (error) {
      logger.error({ error, segmentId: request.segment_id }, 'Failed to update segment');
      return res.status(500).json({ error: 'Failed to update segment' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Segment not found' });
    }

    logger.info({ segmentId: request.segment_id, title: request.title }, 'Now playing updated');

    res.json({
      status: 'ok',
      segment_id: request.segment_id,
      message: 'Now playing updated'
    });

  } catch (error) {
    logger.error({ error }, 'Error in /playout/now-playing');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /playout/segment-complete/:segment_id
 * Mark a segment as aired (completed playback)
 */
router.post('/segment-complete/:segment_id', async (req, res) => {
  try {
    const { segment_id } = req.params;

    if (!segment_id) {
      return res.status(400).json({ error: 'Missing segment_id' });
    }

    const db = getDb();

    // Update segment to aired
    const { data, error } = await db
      .from('segments')
      .update({
        state: 'aired',
        updated_at: new Date().toISOString()
      })
      .eq('id', segment_id)
      .eq('state', 'airing')
      .select();

    if (error) {
      logger.error({ error, segmentId: segment_id }, 'Failed to mark segment complete');
      return res.status(500).json({ error: 'Failed to mark segment complete' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({
        error: 'Segment not found or not currently airing'
      });
    }

    logger.info({ segmentId: segment_id }, 'Segment marked as aired');

    res.json({
      status: 'ok',
      segment_id,
      message: 'Segment marked as aired'
    });

  } catch (error) {
    logger.error({ error }, 'Error in /playout/segment-complete');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /playout/alerts/dead-air
 * Report dead air / silence detected by Liquidsoap
 *
 * Logs alert for monitoring and could trigger notifications
 */
router.post('/alerts/dead-air', async (req, res) => {
  try {
    const request: AlertRequest = req.body;

    // Validate
    if (!request.timestamp || !request.type) {
      return res.status(400).json({
        error: 'Missing required fields: timestamp, type'
      });
    }

    // Log the alert prominently
    logger.error(
      {
        timestamp: request.timestamp,
        type: request.type,
        details: request.details
      },
      'DEAD AIR ALERT: Silence detected in broadcast stream'
    );

    // In production, this could:
    // - Send email/SMS notifications
    // - Create incident in monitoring system (PagerDuty, etc.)
    // - Store in alerts table for historical tracking
    // - Trigger automated recovery procedures

    res.json({
      status: 'ok',
      message: 'Dead air alert recorded'
    });

  } catch (error) {
    logger.error({ error }, 'Error in /playout/alerts/dead-air');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as playoutRouter };
