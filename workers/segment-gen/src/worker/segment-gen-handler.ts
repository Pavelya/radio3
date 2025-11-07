import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ScriptGenerator } from '../llm/script-generator';
import { RAGClient } from '../rag/rag-client';
import { createLogger, type SegmentGenPayload } from '@radio/core';
import { TTSClient } from '../tts/tts-client';
import { AssetStorage } from '../storage/asset-storage';
import { promises as fs } from 'fs';

const logger = createLogger('segment-gen-handler');

/**
 * Handler for segment_make jobs
 * Generates segment scripts using RAG + LLM
 */
export class SegmentGenHandler {
  private db: SupabaseClient;
  private scriptGen: ScriptGenerator;
  private ragClient: RAGClient;
  private ttsClient: TTSClient;
  private assetStorage: AssetStorage;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!supabaseUrl || !supabaseKey || !anthropicKey) {
      throw new Error('Missing required environment variables');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
    this.scriptGen = new ScriptGenerator(anthropicKey);
    this.ragClient = new RAGClient();
    this.ttsClient = new TTSClient();
    this.assetStorage = new AssetStorage();

    logger.info('Segment generation handler initialized');
  }

  /**
   * Process segment_make job
   */
  async handle(job: any): Promise<void> {
    const payload: SegmentGenPayload = job.payload;
    const { segment_id } = payload;

    logger.info({ segment_id }, 'Starting segment generation');

    try {
      // 1. Update segment state to retrieving
      await this.updateSegmentState(segment_id, 'retrieving');

      // 2. Fetch segment details
      const segment = await this.fetchSegment(segment_id);

      if (!segment) {
        throw new Error(`Segment not found: ${segment_id}`);
      }

      // 3. Fetch DJ and program info
      const dj = await this.fetchDJ(segment.program_id);

      // 4. Retrieve RAG context
      const ragQuery = this.ragClient.buildQuery(
        segment,
        new Date().toISOString()
      );

      const ragResult = await this.ragClient.retrieve(ragQuery);

      logger.info({
        segment_id,
        ragChunks: ragResult.chunks.length,
        queryTime: ragResult.query_time_ms
      }, 'RAG context retrieved');

      // 5. Update state to generating
      await this.updateSegmentState(segment_id, 'generating');

      // 6. Generate script
      const scriptResult = await this.scriptGen.generateScript({
        slotType: segment.slot_type,
        targetDuration: this.getTargetDuration(segment.slot_type),
        djName: dj.name,
        djPersonality: dj.personality_traits,
        referenceTime: new Date().toISOString(),
        ragChunks: ragResult.chunks,
        futureYear: 2525
      });

      logger.info({
        segment_id,
        scriptLength: scriptResult.scriptMd.length,
        citations: scriptResult.citations.length
      }, 'Script generated');

      // 7. Validate script
      const validation = this.scriptGen.validateScript(
        scriptResult.scriptMd,
        this.getTargetDuration(segment.slot_type)
      );

      if (!validation.valid) {
        logger.warn({
          segment_id,
          issues: validation.issues
        }, 'Script validation issues');
      }

      // 8. Update segment with script
      await this.updateSegmentWithScript(
        segment_id,
        scriptResult.scriptMd,
        scriptResult.citations,
        scriptResult.metrics
      );

      // 9. Update state to rendering (TTS next)
      await this.updateSegmentState(segment_id, 'rendering');

      // 10. Synthesize speech
      logger.info({ segment_id }, 'Starting TTS synthesis');

      const audioPath = await this.ttsClient.synthesize({
        text: scriptResult.scriptMd,
        model: dj.voice_id || 'en_US-lessac-medium',
        speed: 1.0,
        use_cache: true
      });

      // 11. Store audio asset
      const asset = await this.assetStorage.storeAudio(audioPath, 'speech');

      // Clean up temp file
      await fs.unlink(audioPath);

      // 12. Update segment with asset
      await this.updateSegmentWithAsset(segment_id, asset.assetId, asset.durationSec);

      logger.info({
        segment_id,
        assetId: asset.assetId,
        duration: asset.durationSec
      }, 'Audio asset stored');

      // 13. Update state to normalizing
      await this.updateSegmentState(segment_id, 'normalizing');

      // 14. Enqueue mastering job
      await this.enqueueMasteringJob(segment_id, asset.assetId);

      logger.info({ segment_id }, 'Segment generation complete');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error({
        segment_id,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error
      }, 'Segment generation failed');

      // Update segment to failed
      await this.updateSegmentState(segment_id, 'failed', errorMessage);

      throw error;
    }
  }

  /**
   * Fetch segment from database
   */
  private async fetchSegment(segmentId: string): Promise<any> {
    const { data, error } = await this.db
      .from('segments')
      .select('*')
      .eq('id', segmentId)
      .single();

    if (error) {
      logger.error({ error, segmentId }, 'Failed to fetch segment');
      throw error;
    }

    return data;
  }

  /**
   * Fetch DJ and program info
   */
  private async fetchDJ(programId: string): Promise<any> {
    const { data: program, error: programError } = await this.db
      .from('programs')
      .select('dj_id')
      .eq('id', programId)
      .single();

    if (programError) {
      throw programError;
    }

    const { data: dj, error: djError } = await this.db
      .from('djs')
      .select('name, personality_traits, voice_id')
      .eq('id', program.dj_id)
      .single();

    if (djError) {
      throw djError;
    }

    return dj;
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
   * Update segment with generated script
   */
  private async updateSegmentWithScript(
    segmentId: string,
    scriptMd: string,
    citations: any[],
    metrics: any
  ): Promise<void> {
    const { error } = await this.db
      .from('segments')
      .update({
        script_md: scriptMd,
        citations: citations,
        generation_metrics: metrics,
        updated_at: new Date().toISOString()
      })
      .eq('id', segmentId);

    if (error) {
      logger.error({ error, segmentId }, 'Failed to update segment with script');
      throw error;
    }
  }

  /**
   * Get target duration by slot type
   */
  private getTargetDuration(slotType: string): number {
    const durations: Record<string, number> = {
      'news': 45,
      'culture': 60,
      'tech': 60,
      'history': 90,
      'interview': 120,
      'station_id': 15
    };

    return durations[slotType] || 60;
  }

  /**
   * Update segment with asset ID and duration
   */
  private async updateSegmentWithAsset(
    segmentId: string,
    assetId: string,
    durationSec: number
  ): Promise<void> {
    const { error } = await this.db
      .from('segments')
      .update({
        asset_id: assetId,
        duration_sec: durationSec,
        updated_at: new Date().toISOString()
      })
      .eq('id', segmentId);

    if (error) {
      logger.error({ error, segmentId }, 'Failed to update segment with asset');
      throw error;
    }
  }

  /**
   * Enqueue audio mastering job
   */
  private async enqueueMasteringJob(
    segmentId: string,
    assetId: string
  ): Promise<void> {
    const { data, error } = await this.db.rpc('enqueue_job', {
      p_job_type: 'audio_finalize',
      p_payload: {
        segment_id: segmentId,
        asset_id: assetId,
        content_type: 'speech'
      },
      p_priority: 5,
      p_schedule_delay_sec: 0
    });

    if (error) {
      logger.error({ error, segmentId, assetId }, 'Failed to enqueue mastering job');
      throw error;
    }

    logger.info({ segmentId, assetId, jobId: data }, 'Mastering job enqueued');
  }
}
