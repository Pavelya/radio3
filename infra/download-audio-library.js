#!/usr/bin/env node
/**
 * Download curated audio library from free sources
 *
 * Usage:
 *   node infra/download-audio-library.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../packages/radio-core/dist/index.js');

const logger = createLogger('audio-downloader');

// Curated free tracks from Incompetech (Kevin MacLeod)
// These URLs are examples - update with actual available tracks
const CURATED_MUSIC = [
  {
    title: 'Cipher',
    artist: 'Kevin MacLeod',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cipher.mp3',
    license: 'cc-by',
    attribution: 'Music by Kevin MacLeod (incompetech.com)',
    genre: 'Electronic',
    mood: 'energetic',
    duration_sec: 147,
  },
  {
    title: 'Space Jazz',
    artist: 'Kevin MacLeod',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Space_Jazz.mp3',
    license: 'cc-by',
    attribution: 'Music by Kevin MacLeod (incompetech.com)',
    genre: 'Jazz',
    mood: 'calm',
    duration_sec: 231,
  },
  {
    title: 'Inspired',
    artist: 'Kevin MacLeod',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Inspired.mp3',
    license: 'cc-by',
    attribution: 'Music by Kevin MacLeod (incompetech.com)',
    genre: 'Ambient',
    mood: 'uplifting',
    duration_sec: 199,
  },
  {
    title: 'Floating Cities',
    artist: 'Kevin MacLeod',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Floating_Cities.mp3',
    license: 'cc-by',
    attribution: 'Music by Kevin MacLeod (incompetech.com)',
    genre: 'Ambient',
    mood: 'calm',
    duration_sec: 278,
  },
  {
    title: 'Prelude and Action',
    artist: 'Kevin MacLeod',
    url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Prelude_and_Action.mp3',
    license: 'cc-by',
    attribution: 'Music by Kevin MacLeod (incompetech.com)',
    genre: 'Cinematic',
    mood: 'dramatic',
    duration_sec: 192,
  },
];

const OUTPUT_DIR = path.join(__dirname, '..', 'audio-library');

/**
 * Download a file from URL
 */
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const file = fs.createWriteStream(outputPath);

    protocol
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirect
          file.close();
          fs.unlinkSync(outputPath);
          return downloadFile(response.headers.location, outputPath)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(outputPath);
          return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        file.close();
        fs.unlinkSync(outputPath);
        reject(err);
      });
  });
}

/**
 * Download a single track
 */
async function downloadTrack(trackInfo) {
  const filename = `${trackInfo.title.replace(/\s+/g, '_')}.mp3`;
  const outputPath = path.join(OUTPUT_DIR, 'music', filename);

  // Create directory if needed
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (fs.existsSync(outputPath)) {
    logger.info({ track: trackInfo.title }, '⏭️  Skipping (already exists)');
    return;
  }

  logger.info({ track: trackInfo.title, url: trackInfo.url }, '📥 Downloading...');

  try {
    await downloadFile(trackInfo.url, outputPath);

    // Save metadata
    const metadataPath = outputPath.replace('.mp3', '.json');
    fs.writeFileSync(metadataPath, JSON.stringify(trackInfo, null, 2));

    logger.info({ track: trackInfo.title, size: fs.statSync(outputPath).size }, '✅ Downloaded');
  } catch (error) {
    logger.error({ track: trackInfo.title, error: error.message }, '❌ Download failed');
  }
}

/**
 * Main function
 */
async function main() {
  logger.info('🎵 Downloading Audio Library');
  logger.info('='.repeat(50));

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  logger.info({ count: CURATED_MUSIC.length }, 'Downloading tracks');

  for (const track of CURATED_MUSIC) {
    await downloadTrack(track);
  }

  logger.info('✅ Download complete!');
  logger.info({ outputDir: OUTPUT_DIR }, 'Files saved');
  logger.info('Next steps:');
  logger.info('1. Review audio files');
  logger.info('2. Upload to Supabase: node infra/upload-audio-library.js');
  logger.info('3. View in admin: http://localhost:3001/dashboard/music');
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});
