import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import * as crypto from 'crypto';
import { createLogger, type StoredAsset } from '@radio/core';

const logger = createLogger('asset-storage');

/**
 * Service for storing audio assets in Supabase Storage
 */
export class AssetStorage {
  private db: SupabaseClient;
  private readonly bucketName = 'audio-assets';

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    this.db = createClient(supabaseUrl, supabaseKey);

    logger.info({ bucket: this.bucketName }, 'Asset storage initialized');
  }

  /**
   * Store audio file
   */
  async storeAudio(
    audioPath: string,
    contentType: string = 'speech'
  ): Promise<StoredAsset> {
    logger.info({ audioPath, contentType }, 'Storing audio asset');

    try {
      // Read file
      const audioData = await fs.readFile(audioPath);

      // Calculate content hash
      const contentHash = crypto
        .createHash('sha256')
        .update(audioData)
        .digest('hex');

      // Check for duplicate
      const existing = await this.findByContentHash(contentHash);
      if (existing) {
        logger.info({ contentHash, existingId: existing.id }, 'Duplicate audio found');
        return {
          assetId: existing.id,
          storagePath: existing.storage_path,
          contentHash,
          durationSec: existing.duration_sec || 0
        };
      }

      // Get duration
      const durationSec = await this.getAudioDuration(audioPath);

      // Upload to storage
      const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.wav`;
      const storagePath = `raw/${fileName}`;

      const { error: uploadError } = await this.db.storage
        .from(this.bucketName)
        .upload(storagePath, audioData, {
          contentType: 'audio/wav',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      // Create asset record
      const { data: asset, error: insertError } = await this.db
        .from('assets')
        .insert({
          storage_path: storagePath,
          content_type: contentType,
          content_hash: contentHash,
          duration_sec: durationSec,
          validation_status: 'pending'
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      logger.info({
        assetId: asset.id,
        storagePath,
        durationSec,
        sizeKB: Math.round(audioData.length / 1024)
      }, 'Audio asset stored');

      return {
        assetId: asset.id,
        storagePath,
        contentHash,
        durationSec
      };

    } catch (error) {
      logger.error({ error, audioPath }, 'Failed to store audio');
      throw error;
    }
  }

  /**
   * Find existing asset by content hash
   */
  private async findByContentHash(contentHash: string): Promise<any> {
    const { data, error } = await this.db
      .from('assets')
      .select('*')
      .eq('content_hash', contentHash)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      throw error;
    }

    return data;
  }

  /**
   * Get audio duration using ffprobe
   */
  private async getAudioDuration(filePath: string): Promise<number> {
    const { spawn } = require('child_process');

    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);

      let output = '';

      ffprobe.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      ffprobe.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error('ffprobe failed'));
        } else {
          resolve(parseFloat(output.trim()));
        }
      });
    });
  }
}
