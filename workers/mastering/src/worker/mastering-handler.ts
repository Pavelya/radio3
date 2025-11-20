import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AudioProcessor } from '../audio/audio-processor';
import { createLogger, type MasteringJobPayload } from '@radio/core';
import { promises as fs } from 'fs';
import * as path from 'path';

const logger = createLogger('mastering-handler');

/**
 * Handler for audio_finalize jobs
 */
export class MasteringHandler {
  private db: SupabaseClient;
  private processor: AudioProcessor;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
    this.processor = new AudioProcessor();

    logger.info('Mastering handler initialized');
  }

  /**
   * Check if identical audio already exists (dedupe)
   */
  private async checkForDuplicate(contentHash: string): Promise<string | null> {
    logger.debug({ contentHash }, 'Checking for duplicate audio');

    const { data, error } = await this.db
      .from('assets')
      .select('id, storage_path, lufs_integrated, peak_db, validation_status')
      .eq('content_hash', contentHash)
      .eq('validation_status', 'passed')
      .not('lufs_integrated', 'is', null)
      .limit(1);

    if (error) {
      logger.error({ error }, 'Failed to check for duplicates');
      return null;
    }

    if (data && data.length > 0) {
      logger.info({
        contentHash,
        existingAssetId: data[0].id
      }, 'Duplicate audio found');
      return data[0].id;
    }

    return null;
  }

  /**
   * Process audio_finalize job
   */
  async handle(job: any): Promise<void> {
    const payload: MasteringJobPayload = job.payload;
    const { segment_id, asset_id, content_type } = payload;

    logger.info({ segment_id, asset_id }, 'Starting audio mastering');

    try {
      // 1. Fetch asset
      const asset = await this.fetchAsset(asset_id);

      if (!asset) {
        throw new Error(`Asset not found: ${asset_id}`);
      }

      // 1.5 CHECK FOR DUPLICATE (NEW)
      if (asset.content_hash) {
        const duplicateAssetId = await this.checkForDuplicate(asset.content_hash);

        if (duplicateAssetId && duplicateAssetId !== asset_id) {
          logger.info({
            segment_id,
            originalAssetId: asset_id,
            duplicateAssetId
          }, 'Reusing existing normalized audio');

          // Update segment to point to existing asset
          await this.updateSegmentAsset(segment_id, duplicateAssetId);

          // Update segment to ready
          await this.updateSegmentState(segment_id, 'ready');

          // Mark original asset as duplicate (optional)
          await this.updateAsset(asset_id, {
            validation_status: 'passed',
            validation_errors: null,
            metadata: { duplicate_of: duplicateAssetId }
          });

          logger.info({ segment_id }, 'Mastering skipped (duplicate reused)');
          return; // SKIP MASTERING
        }
      }

      // 2. Download raw audio
      const rawAudioPath = await this.downloadAudio(asset.storage_path);

      logger.info({ rawAudioPath }, 'Raw audio downloaded');

      // 3. Normalize audio
      const result = await this.processor.normalize(rawAudioPath, {
        targetLUFS: content_type === 'speech' ? -16.0 : -14.0
      });

      // 4. Validate quality
      const validation = this.processor.validateQuality(result);

      if (!validation.valid) {
        logger.warn({
          asset_id,
          issues: validation.issues
        }, 'Audio quality issues detected');
      }

      // 5. Upload normalized audio
      await this.uploadNormalizedAudio(
        asset_id,
        result.outputPath
      );

      // 5.5 Delete raw file to save storage
      const { error: deleteError } = await this.db.storage
        .from('audio-assets')
        .remove([asset.storage_path]);

      if (deleteError) {
        logger.warn({ error: deleteError, rawPath: asset.storage_path }, 'Failed to delete raw file');
      } else {
        logger.info({ rawPath: asset.storage_path }, 'Raw file deleted (storage saved)');
      }

      // 6. Update asset record
      await this.updateAsset(asset_id, {
        lufs_integrated: result.lufsIntegrated,
        peak_db: result.peakDb,
        duration_sec: result.durationSec,
        validation_status: validation.valid ? 'passed' : 'failed',
        validation_errors: validation.valid ? null : validation.issues
      });

      // 7. Update segment to ready
      await this.updateSegmentState(segment_id, 'ready');

      // Clean up temp files
      await fs.unlink(rawAudioPath);
      await fs.unlink(result.outputPath);

      logger.info({ segment_id, asset_id }, 'Audio mastering complete');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        segment_id,
        asset_id,
        error: errorMessage
      }, 'Audio mastering failed');

      // Update segment to failed
      await this.updateSegmentState(segment_id, 'failed', errorMessage);

      throw error;
    }
  }

  /**
   * Fetch asset from database
   */
  private async fetchAsset(assetId: string): Promise<any> {
    const { data, error } = await this.db
      .from('assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (error) {
      logger.error({ error, assetId }, 'Failed to fetch asset');
      throw error;
    }

    return data;
  }

  /**
   * Download audio from storage
   */
  private async downloadAudio(storagePath: string): Promise<string> {
    const { data, error } = await this.db.storage
      .from('audio-assets')
      .download(storagePath);

    if (error) {
      throw error;
    }

    // Save to temp file
    const tempPath = path.join('/tmp', `raw-${Date.now()}.wav`);
    const buffer = Buffer.from(await data.arrayBuffer());
    await fs.writeFile(tempPath, buffer);

    return tempPath;
  }

  /**
   * Upload normalized audio
   */
  private async uploadNormalizedAudio(
    assetId: string,
    normalizedPath: string
  ): Promise<void> {
    const audioData = await fs.readFile(normalizedPath);

    // Upload to final location
    const finalPath = `final/${assetId}.wav`;

    const { error } = await this.db.storage
      .from('audio-assets')
      .upload(finalPath, audioData, {
        contentType: 'audio/wav',
        upsert: true
      });

    if (error) {
      throw error;
    }

    logger.info({ assetId, finalPath }, 'Normalized audio uploaded');
  }

  /**
   * Update asset record
   */
  private async updateAsset(
    assetId: string,
    updates: any
  ): Promise<void> {
    const { error } = await this.db
      .from('assets')
      .update(updates)
      .eq('id', assetId);

    if (error) {
      logger.error({ error, assetId }, 'Failed to update asset');
      throw error;
    }
  }

  /**
   * Update segment state
   */
  private async updateSegmentState(
    segmentId: string,
    state: string,
    error?: string
  ): Promise<void> {
    const updates: any = {
      state,
      updated_at: new Date().toISOString()
    };

    if (error) {
      updates.last_error = error;
    }

    const { error: updateError } = await this.db
      .from('segments')
      .update(updates)
      .eq('id', segmentId);

    if (updateError) {
      logger.error({ error: updateError, segmentId }, 'Failed to update segment state');
      throw updateError;
    }
  }

  /**
   * Update segment asset reference
   */
  private async updateSegmentAsset(
    segmentId: string,
    assetId: string
  ): Promise<void> {
    const { error } = await this.db
      .from('segments')
      .update({
        asset_id: assetId,
        updated_at: new Date().toISOString()
      })
      .eq('id', segmentId);

    if (error) {
      logger.error({ error, segmentId }, 'Failed to update segment asset');
      throw error;
    }
  }
}
