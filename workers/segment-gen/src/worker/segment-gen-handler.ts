import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ScriptGenerator } from '../llm/script-generator';
import { ConversationGenerator } from '../llm/conversation-generator';
import { RAGClient } from '../rag/rag-client';
import { createLogger, type SegmentGenPayload } from '@radio/core';
import { TTSClient } from '../tts/tts-client';
import { MultiVoiceRenderer } from '../tts/multi-voice-renderer';
import { AssetStorage } from '../storage/asset-storage';
import { ToneValidator } from '../validators/tone-validator';
import { ConsistencyChecker } from '../validators/consistency-checker';
import { promises as fs } from 'fs';

const logger = createLogger('segment-gen-handler');

/**
 * Calculate the future year based on current year + offset
 * Default offset is 500 years (configurable via FUTURE_YEAR_OFFSET env var)
 */
function getFutureYear(): number {
  const currentYear = new Date().getFullYear();
  const offset = parseInt(process.env.FUTURE_YEAR_OFFSET || '500', 10);
  return currentYear + offset;
}

/**
 * Handler for segment_make jobs
 * Generates segment scripts using RAG + LLM
 */
export class SegmentGenHandler {
  private db: SupabaseClient;
  private scriptGen: ScriptGenerator;
  private conversationGen: ConversationGenerator;
  private ragClient: RAGClient;
  private ttsClient: TTSClient;
  private multiVoiceRenderer: MultiVoiceRenderer;
  private assetStorage: AssetStorage;
  private toneValidator: ToneValidator;
  private consistencyChecker: ConsistencyChecker;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!supabaseUrl || !supabaseKey || !anthropicKey) {
      throw new Error('Missing required environment variables');
    }

    this.db = createClient(supabaseUrl, supabaseKey);
    this.scriptGen = new ScriptGenerator(anthropicKey);
    this.conversationGen = new ConversationGenerator(anthropicKey);
    this.ragClient = new RAGClient();
    this.ttsClient = new TTSClient();
    this.multiVoiceRenderer = new MultiVoiceRenderer();
    this.assetStorage = new AssetStorage();
    this.toneValidator = new ToneValidator();
    this.consistencyChecker = new ConsistencyChecker();

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

      // Check if this is a multi-speaker conversation
      if (segment.conversation_format && segment.conversation_format !== 'monologue') {
        await this.handleMultiSpeakerSegment(segment_id, segment);
        return;
      }

      // 3. Fetch DJ and program info (for monologue segments)
      const dj = await this.fetchDJ(segment.program_id);

      // 4. Retrieve RAG context
      // Use the segment's scheduled broadcast time, not current time
      const broadcastTime = segment.scheduled_start_ts || new Date().toISOString();

      logger.info({
        segment_id,
        scheduled_start: segment.scheduled_start_ts,
        broadcast_time: broadcastTime,
      }, 'Using scheduled broadcast time for generation');

      const ragQuery = this.ragClient.buildQuery(
        segment,
        broadcastTime
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
        referenceTime: broadcastTime,
        ragChunks: ragResult.chunks,
        futureYear: getFutureYear()
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

      // 7b. Validate tone against style guide
      const toneAnalysis = this.toneValidator.analyzeScript(scriptResult.scriptMd);

      if (!this.toneValidator.isAcceptable(toneAnalysis)) {
        logger.warn({
          segment_id,
          score: toneAnalysis.score,
          issues: toneAnalysis.issues,
        }, 'Script failed tone validation but continuing');
      }

      // 7c. Check consistency against canonical lore
      const contradictions = await this.consistencyChecker.checkScript(
        segment_id,
        scriptResult.scriptMd
      );

      const timelineIssues = await this.consistencyChecker.checkTimeline(
        scriptResult.scriptMd
      );

      if (contradictions.length > 0 || timelineIssues.length > 0) {
        logger.warn({
          segment_id,
          contradictions: contradictions.length,
          timelineIssues: timelineIssues.length,
        }, 'Consistency issues detected');

        // Flag for review if major contradictions
        const majorContradictions = contradictions.filter(
          (c) => c.severity === 'major'
        );

        if (majorContradictions.length > 0) {
          await this.db
            .from('segments')
            .update({
              state: 'failed',
              last_error: `Major lore contradictions detected: ${majorContradictions.map(c => c.factKey).join(', ')}`,
            })
            .eq('id', segment_id);

          throw new Error(
            'Major lore contradictions - segment generation aborted'
          );
        }
      }

      // 8. Update segment with script and tone analysis
      await this.updateSegmentWithScript(
        segment_id,
        scriptResult.scriptMd,
        scriptResult.citations,
        scriptResult.metrics
      );

      // 8b. Store tone validation results
      await this.db
        .from('segments')
        .update({
          tone_score: toneAnalysis.score,
          tone_balance: `${toneAnalysis.optimismPct}/${toneAnalysis.realismPct}/${toneAnalysis.wonderPct}`,
          validation_issues: toneAnalysis.issues,
          validation_suggestions: toneAnalysis.suggestions,
        })
        .eq('id', segment_id);

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
   * Fetch segment from database with program and DJ information
   */
  private async fetchSegment(segmentId: string): Promise<any> {
    const { data, error } = await this.db
      .from('segments')
      .select(`
        *,
        programs!fk_segments_program(
          id,
          name,
          conversation_format,
          program_djs(
            dj_id,
            role,
            speaking_order,
            dj:djs(id, name, slug, voice_id, personality_traits, specializations)
          )
        )
      `)
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

  /**
   * Handle multi-speaker conversation segment generation
   */
  private async handleMultiSpeakerSegment(
    segmentId: string,
    segment: any
  ): Promise<void> {
    logger.info(
      { segmentId, format: segment.conversation_format },
      'Generating multi-speaker segment'
    );

    // 1. Check if conversation_participants exist, if not create from program_djs
    const { data: existingParticipants } = await this.db
      .from('conversation_participants')
      .select('id')
      .eq('segment_id', segmentId);

    if (!existingParticipants || existingParticipants.length === 0) {
      // Create conversation_participants from program_djs
      if (segment.programs?.program_djs?.length > 1) {
        const participantsToInsert = segment.programs.program_djs.map((pd: any) => ({
          segment_id: segmentId,
          dj_id: pd.dj_id,
          role: pd.role,
          speaking_order: pd.speaking_order,
        }));

        const { error: insertError } = await this.db
          .from('conversation_participants')
          .insert(participantsToInsert);

        if (insertError) {
          logger.error({ error: insertError }, 'Failed to create conversation participants');
          throw insertError;
        }

        logger.info({ segmentId, participants: participantsToInsert.length }, 'Created conversation participants from program_djs');
      }
    }

    // 2. Fetch conversation participants with DJ details
    const { data: participants, error: participantsError } = await this.db
      .from('conversation_participants')
      .select('*, djs(*)')
      .eq('segment_id', segmentId)
      .order('speaking_order');

    if (participantsError) {
      throw participantsError;
    }

    if (!participants || participants.length < 2) {
      throw new Error('Multi-speaker segment needs at least 2 participants');
    }

    // 3. Identify host and other participants
    const host = participants.find(p => p.role === 'host') || participants[0];
    const otherParticipants = participants.filter(p => p.id !== host.id);

    // 3. Retrieve RAG context
    // Use the segment's scheduled broadcast time, not current time
    const broadcastTime = segment.scheduled_start_ts || new Date().toISOString();

    logger.info({
      segmentId,
      scheduled_start: segment.scheduled_start_ts,
      broadcast_time: broadcastTime,
    }, 'Using scheduled broadcast time for multi-speaker generation');

    const ragQuery = this.ragClient.buildQuery(
      segment,
      broadcastTime
    );

    const ragResult = await this.ragClient.retrieve(ragQuery);

    logger.info({
      segmentId,
      ragChunks: ragResult.chunks.length,
      queryTime: ragResult.query_time_ms
    }, 'RAG context retrieved for conversation');

    // 4. Build RAG context string
    const retrievedContext = ragResult.chunks
      .slice(0, 5)
      .map((chunk, i) => {
        return `[Source ${i + 1}: ${chunk.source_type}]\n${chunk.chunk_text}\n[Relevance: ${(chunk.final_score * 100).toFixed(1)}%]`;
      })
      .join('\n\n---\n\n');

    // 5. Update state to generating
    await this.updateSegmentState(segmentId, 'generating');

    // 6. Build conversation context
    const conversationContext = {
      format: segment.conversation_format,
      host: {
        name: host.djs.name,
        personality: Array.isArray(host.djs.personality_traits)
          ? host.djs.personality_traits.join(', ')
          : host.djs.personality_traits || 'Professional and engaging',
      },
      participants: otherParticipants.map(p => ({
        name: p.character_name || p.djs.name,
        role: p.role,
        background: p.character_background || (
          Array.isArray(p.djs.personality_traits)
            ? p.djs.personality_traits.join(', ')
            : p.djs.personality_traits || ''
        ),
        expertise: p.character_expertise,
      })),
      topic: segment.slot_type,
      retrievedContext,
      duration: segment.duration_sec || this.getTargetDuration(segment.slot_type),
      tone: this.determineTone(segment.slot_type),
      referenceTime: broadcastTime,
      futureYear: getFutureYear(),
    };

    // 7. Generate conversation
    const conversationResult = await this.conversationGen.generateConversation(
      conversationContext
    );

    logger.info({
      segmentId,
      turns: conversationResult.turns.length,
      speakers: participants.length,
    }, 'Conversation script generated');

    // 8. Validate conversation
    const validation = this.conversationGen.validateConversation(conversationResult.turns);
    if (!validation.valid) {
      logger.warn({ issues: validation.issues }, 'Conversation quality issues detected');
    }

    // 8b. Validate tone against style guide
    const toneAnalysis = this.toneValidator.analyzeScript(conversationResult.fullScript);

    if (!this.toneValidator.isAcceptable(toneAnalysis)) {
      logger.warn({
        segmentId,
        score: toneAnalysis.score,
        issues: toneAnalysis.issues,
      }, 'Conversation failed tone validation but continuing');
    }

    // 8c. Check consistency against canonical lore
    const contradictions = await this.consistencyChecker.checkScript(
      segmentId,
      conversationResult.fullScript
    );

    const timelineIssues = await this.consistencyChecker.checkTimeline(
      conversationResult.fullScript
    );

    if (contradictions.length > 0 || timelineIssues.length > 0) {
      logger.warn({
        segmentId,
        contradictions: contradictions.length,
        timelineIssues: timelineIssues.length,
      }, 'Consistency issues detected in conversation');

      // Flag for review if major contradictions
      const majorContradictions = contradictions.filter(
        (c) => c.severity === 'major'
      );

      if (majorContradictions.length > 0) {
        await this.db
          .from('segments')
          .update({
            state: 'failed',
            last_error: `Major lore contradictions detected: ${majorContradictions.map(c => c.factKey).join(', ')}`,
          })
          .eq('id', segmentId);

        throw new Error(
          'Major lore contradictions - conversation generation aborted'
        );
      }
    }

    // 9. Update segment with script
    await this.updateSegmentWithScript(
      segmentId,
      conversationResult.fullScript,
      ragResult.chunks.slice(0, 5).map((chunk, i) => ({
        index: i + 1,
        source_id: chunk.source_id,
        source_type: chunk.source_type,
        chunk_id: chunk.chunk_id,
        score: chunk.final_score
      })),
      conversationResult.metrics
    );

    // 9b. Store tone validation results
    await this.db
      .from('segments')
      .update({
        tone_score: toneAnalysis.score,
        tone_balance: `${toneAnalysis.optimismPct}/${toneAnalysis.realismPct}/${toneAnalysis.wonderPct}`,
        validation_issues: toneAnalysis.issues,
        validation_suggestions: toneAnalysis.suggestions,
      })
      .eq('id', segmentId);

    // 10. Store conversation turns
    for (let i = 0; i < conversationResult.turns.length; i++) {
      const turn = conversationResult.turns[i];

      // Find matching participant by name
      const participant = participants.find(
        p =>
          p.djs.name.toUpperCase() === turn.speaker ||
          p.character_name?.toUpperCase() === turn.speaker
      );

      const { error: turnError } = await this.db
        .from('conversation_turns')
        .insert({
          segment_id: segmentId,
          participant_id: participant?.id,
          turn_number: i + 1,
          speaker_name: turn.speaker,
          text_content: turn.text,
        });

      if (turnError) {
        logger.error({ error: turnError, segmentId, turn: i + 1 }, 'Failed to store conversation turn');
        throw turnError;
      }
    }

    logger.info({
      segmentId,
      turns: conversationResult.turns.length,
    }, 'Conversation turns stored');

    // 11. Update state to rendering
    await this.updateSegmentState(segmentId, 'rendering');

    // 12. Render multi-voice audio
    logger.info({ segmentId }, 'Starting multi-voice TTS synthesis');

    const audioPath = await this.multiVoiceRenderer.renderConversation(segmentId);

    // 13. Store audio asset
    const asset = await this.assetStorage.storeAudio(audioPath, 'speech');

    // Clean up temp file
    await fs.unlink(audioPath);

    // 14. Update segment with asset
    await this.updateSegmentWithAsset(segmentId, asset.assetId, asset.durationSec);

    logger.info({
      segmentId,
      assetId: asset.assetId,
      duration: asset.durationSec
    }, 'Multi-voice audio asset stored');

    // 15. Clean up temporary conversation audio files
    await this.multiVoiceRenderer.cleanup(segmentId);

    // 16. Update state to normalizing
    await this.updateSegmentState(segmentId, 'normalizing');

    // 17. Enqueue mastering job
    await this.enqueueMasteringJob(segmentId, asset.assetId);

    logger.info({ segmentId }, 'Multi-speaker segment generation complete');
  }

  /**
   * Determine tone based on slot type
   */
  private determineTone(slotType: string): string {
    const tones: Record<string, string> = {
      'news': 'Professional and authoritative',
      'culture': 'Engaging and insightful',
      'tech': 'Enthusiastic and informative',
      'history': 'Educational and storytelling',
      'interview': 'Conversational and probing',
      'station_id': 'Energetic and branded',
    };

    return tones[slotType] || 'Professional and engaging';
  }
}
