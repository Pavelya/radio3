#!/usr/bin/env node
/**
 * Bulk upload audio library to Supabase
 *
 * Usage:
 *   node infra/upload-audio-library.js
 *
 * Environment:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key for admin operations
 */

const { createClient } = require('@supabase/supabase-js');
const { createLogger } = require('../packages/radio-core/dist/index.js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const logger = createLogger('audio-uploader');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AUDIO_DIR = path.join(__dirname, '..', 'audio-library');
const JINGLES_DIR = path.join(__dirname, '..', 'generated-jingles');

/**
 * Get audio duration using ffprobe
 */
function getAudioDuration(filePath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf8' }
    );
    return parseFloat(output.trim());
  } catch (error) {
    logger.error({ filePath, error: error.message }, 'Failed to get audio duration');
    return 0;
  }
}

/**
 * Upload music track to Supabase
 */
async function uploadMusicTrack(filePath, metadata) {
  const fileName = path.basename(filePath);
  const storagePath = `music/${fileName}`;

  logger.info({ track: metadata.title }, '📤 Uploading music track...');

  try {
    // Upload file to storage
    const fileBuffer = fs.readFileSync(filePath);

    const { error: uploadError } = await supabase.storage
      .from('audio-assets')
      .upload(storagePath, fileBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get or create genre
    let genreId = null;
    if (metadata.genre) {
      const { data: existingGenre } = await supabase
        .from('music_genres')
        .select('id')
        .eq('name', metadata.genre)
        .single();

      if (existingGenre) {
        genreId = existingGenre.id;
      } else {
        const { data: newGenre, error: genreError } = await supabase
          .from('music_genres')
          .insert({ name: metadata.genre })
          .select()
          .single();

        if (!genreError && newGenre) {
          genreId = newGenre.id;
        }
      }
    }

    // Get duration
    const durationSec = metadata.duration_sec || getAudioDuration(filePath);

    // Insert into database
    const trackData = {
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album || null,
      genre_id: genreId,
      storage_path: storagePath,
      duration_sec: durationSec,
      license_type: metadata.license || 'cc-by',
      attribution_text: metadata.attribution,
      attribution_required: true,
      mood: metadata.mood || null,
      active: true,
      reviewed: true,
    };

    const { error: insertError } = await supabase
      .from('music_tracks')
      .upsert(trackData, { onConflict: 'storage_path' });

    if (insertError) {
      throw insertError;
    }

    logger.info({ track: metadata.title }, '✅ Uploaded successfully');
  } catch (error) {
    logger.error({ track: metadata.title, error: error.message }, '❌ Upload failed');
  }
}

/**
 * Upload jingle to Supabase
 */
async function uploadJingle(filePath, jingleName, jingleType) {
  const fileName = path.basename(filePath);
  const storagePath = `jingles/${fileName}`;

  logger.info({ jingle: jingleName }, '📤 Uploading jingle...');

  try {
    // Upload file to storage
    const fileBuffer = fs.readFileSync(filePath);

    const { error: uploadError } = await supabase.storage
      .from('audio-assets')
      .upload(storagePath, fileBuffer, {
        contentType: 'audio/wav',
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get duration
    const durationSec = getAudioDuration(filePath);

    // Insert into database
    const jingleData = {
      name: jingleName,
      jingle_type: jingleType,
      storage_path: storagePath,
      duration_sec: durationSec,
      active: true,
    };

    const { error: insertError } = await supabase
      .from('jingles')
      .upsert(jingleData, { onConflict: 'storage_path' });

    if (insertError) {
      throw insertError;
    }

    logger.info({ jingle: jingleName }, '✅ Uploaded successfully');
  } catch (error) {
    logger.error({ jingle: jingleName, error: error.message }, '❌ Upload failed');
  }
}

/**
 * Determine jingle type from filename
 */
function getJingleType(filename) {
  const jingleTypes = {
    station_id: 'station_id',
    news_intro: 'news_intro',
    culture_intro: 'program_intro',
    tech_intro: 'program_intro',
    interview_intro: 'program_intro',
    transition: 'transition',
  };

  for (const [pattern, type] of Object.entries(jingleTypes)) {
    if (filename.includes(pattern)) {
      return type;
    }
  }

  return 'station_id';
}

/**
 * Main function
 */
async function main() {
  logger.info('📤 Uploading Audio Library to Supabase');
  logger.info('='.repeat(50));

  // Check environment variables
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }

  // Upload music tracks
  const musicDir = path.join(AUDIO_DIR, 'music');
  if (fs.existsSync(musicDir)) {
    logger.info('🎵 Uploading music tracks...');

    const files = fs.readdirSync(musicDir).filter((f) => f.endsWith('.mp3'));

    for (const file of files) {
      const mp3Path = path.join(musicDir, file);
      const metadataPath = mp3Path.replace('.mp3', '.json');

      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        await uploadMusicTrack(mp3Path, metadata);
      } else {
        logger.warn({ file }, 'No metadata file found, skipping');
      }
    }
  }

  // Upload jingles
  if (fs.existsSync(JINGLES_DIR)) {
    logger.info('🎺 Uploading jingles...');

    const files = fs.readdirSync(JINGLES_DIR).filter((f) => f.endsWith('.wav'));

    for (const file of files) {
      const wavPath = path.join(JINGLES_DIR, file);
      const jingleName = path.basename(file, '.wav');
      const jingleType = getJingleType(jingleName);

      await uploadJingle(wavPath, jingleName, jingleType);
    }
  }

  logger.info('✅ Upload complete!');
  logger.info('Next steps:');
  logger.info('1. View music at: http://localhost:3001/dashboard/music');
  logger.info('2. View jingles at: http://localhost:3001/dashboard/music/jingles');
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});
