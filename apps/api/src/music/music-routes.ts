import { Router, type Router as ExpressRouter } from 'express';
import multer from 'multer';
import { getDb } from '../db';
import { MusicService } from './music-service';
import { createLogger } from '@radio/core';

const logger = createLogger('music-routes');
const router: ExpressRouter = Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) {
      cb(new Error('Only audio files are allowed'));
      return;
    }
    cb(null, true);
  },
});

// Initialize service
const db = getDb();
const musicService = new MusicService(db);

/**
 * POST /music/next-track
 * Get next music track based on context
 */
router.post('/next-track', async (req, res) => {
  try {
    const { mood, time_of_day, program_type } = req.body;

    const track = await musicService.getNextTrack({
      mood,
      time_of_day,
      program_type
    });

    if (!track) {
      return res.status(404).json({ error: 'No suitable track found' });
    }

    // Generate signed URL for audio file
    const { data: signedUrlData, error: urlError } = await db.storage
      .from('audio-assets')
      .createSignedUrl(track.storage_path, 3600);

    if (urlError) {
      logger.error({ error: urlError }, 'Failed to generate signed URL');
      return res.status(500).json({ error: 'Failed to generate audio URL' });
    }

    res.json({
      id: track.id,
      title: track.title,
      artist: track.artist,
      duration_sec: track.duration_sec,
      audio_url: signedUrlData.signedUrl,
      attribution: track.attribution_text
    });
  } catch (error) {
    logger.error({ error }, 'Error in next-track endpoint');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /music/jingle/:jingle_type
 * Get jingle by type
 */
router.get('/jingle/:jingle_type', async (req, res) => {
  try {
    const { jingle_type } = req.params;
    const { program_id } = req.query;

    const jingle = await musicService.getJingle(
      jingle_type,
      program_id as string | undefined
    );

    if (!jingle) {
      return res.status(404).json({ error: 'No jingle found' });
    }

    // Generate signed URL
    const { data: signedUrlData, error: urlError } = await db.storage
      .from('audio-assets')
      .createSignedUrl(jingle.storage_path, 3600);

    if (urlError) {
      logger.error({ error: urlError }, 'Failed to generate signed URL');
      return res.status(500).json({ error: 'Failed to generate audio URL' });
    }

    res.json({
      id: jingle.id,
      name: jingle.name,
      duration_sec: jingle.duration_sec,
      audio_url: signedUrlData.signedUrl
    });
  } catch (error) {
    logger.error({ error }, 'Error in jingle endpoint');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /music/sound-effect/:category
 * Get sound effect by category
 */
router.get('/sound-effect/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const tags = req.query.tags
      ? (req.query.tags as string).split(',')
      : undefined;

    const soundEffect = await musicService.getSoundEffect(category, tags);

    if (!soundEffect) {
      return res.status(404).json({ error: 'No sound effect found' });
    }

    // Generate signed URL
    const { data: signedUrlData, error: urlError } = await db.storage
      .from('audio-assets')
      .createSignedUrl(soundEffect.storage_path, 3600);

    if (urlError) {
      logger.error({ error: urlError }, 'Failed to generate signed URL');
      return res.status(500).json({ error: 'Failed to generate audio URL' });
    }

    res.json({
      id: soundEffect.id,
      name: soundEffect.name,
      duration_sec: soundEffect.duration_sec,
      audio_url: signedUrlData.signedUrl,
      attribution: soundEffect.attribution_text
    });
  } catch (error) {
    logger.error({ error }, 'Error in sound-effect endpoint');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /music/tracks
 * List music tracks with filters
 */
router.get('/tracks', async (req, res) => {
  try {
    const { genre_id, mood, active_only } = req.query;

    const tracks = await musicService.listTracks({
      genre_id: genre_id as string | undefined,
      mood: mood as string | undefined,
      active_only: active_only === 'false' ? false : true
    });

    res.json({ tracks });
  } catch (error) {
    logger.error({ error }, 'Error in tracks list endpoint');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /music/genres
 * List all music genres
 */
router.get('/genres', async (req, res) => {
  try {
    const genres = await musicService.listGenres();
    res.json({ genres });
  } catch (error) {
    logger.error({ error }, 'Error in genres endpoint');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /music/playlists/:playlist_id/tracks
 * Get all tracks in a playlist
 */
router.get('/playlists/:playlist_id/tracks', async (req, res) => {
  try {
    const { playlist_id } = req.params;
    const tracks = await musicService.getPlaylistTracks(playlist_id);
    res.json({ tracks });
  } catch (error) {
    logger.error({ error }, 'Error in playlist tracks endpoint');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /music/upload
 * Upload music file to storage
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await musicService.uploadMusicFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    if (result.isDuplicate) {
      return res.status(409).json({
        duplicate: true,
        existingTrack: result.existingTrack,
        message: 'File already exists in library',
      });
    }

    res.json({
      storagePath: result.storagePath,
      fileHash: result.fileHash,
      filename: req.file.originalname,
    });
  } catch (error: any) {
    logger.error({ error }, 'Upload error');
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

/**
 * POST /music/tracks
 * Create track metadata
 */
router.post('/tracks', async (req, res) => {
  try {
    const track = await musicService.createTrack(req.body);
    res.status(201).json({ track });
  } catch (error: any) {
    logger.error({ error }, 'Create track error');
    res.status(500).json({ error: error.message || 'Failed to create track' });
  }
});

/**
 * GET /music/tracks/:id
 * Get track by ID
 */
router.get('/tracks/:id', async (req, res) => {
  try {
    const track = await musicService.getTrackById(req.params.id);

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    res.json({ track });
  } catch (error: any) {
    logger.error({ error }, 'Get track error');
    res.status(404).json({ error: error.message || 'Track not found' });
  }
});

/**
 * PATCH /music/tracks/:id
 * Update track metadata
 */
router.patch('/tracks/:id', async (req, res) => {
  try {
    const track = await musicService.updateTrack(req.params.id, req.body);
    res.json({ track });
  } catch (error: any) {
    logger.error({ error }, 'Update track error');
    res.status(500).json({ error: error.message || 'Failed to update track' });
  }
});

/**
 * DELETE /music/tracks/:id
 * Delete track
 */
router.delete('/tracks/:id', async (req, res) => {
  try {
    await musicService.deleteTrack(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ error }, 'Delete track error');
    res.status(500).json({ error: error.message || 'Failed to delete track' });
  }
});

export { router as musicRouter };
