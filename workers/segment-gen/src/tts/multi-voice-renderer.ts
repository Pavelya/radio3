import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import { createLogger } from '@radio/core';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const logger = createLogger('multi-voice-renderer');

interface ConversationTurn {
  id: string;
  turn_number: number;
  speaker_name: string;
  text_content: string;
  participant_id: string;
  voice_id: string;
}

export class MultiVoiceRenderer {
  private supabase: SupabaseClient;
  private piperUrl: string;
  private tempDir: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.piperUrl = process.env.PIPER_TTS_URL || 'http://localhost:5002';
    this.tempDir = '/tmp/conversation-audio';

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Render entire multi-speaker conversation
   */
  async renderConversation(segmentId: string): Promise<string> {
    logger.info({ segmentId }, 'Rendering multi-speaker conversation');

    // Get all turns with participant voice info
    const { data: turns, error } = await this.supabase
      .from('conversation_turns')
      .select(`
        *,
        conversation_participants!inner(
          djs!inner(voice_id)
        )
      `)
      .eq('segment_id', segmentId)
      .order('turn_number');

    if (error || !turns || turns.length === 0) {
      throw new Error(`Failed to fetch conversation turns: ${error?.message}`);
    }

    logger.info({ turns: turns.length }, 'Processing conversation turns');

    // Synthesize each turn
    const audioFiles: string[] = [];

    for (const turn of turns) {
      try {
        const audioFile = await this.synthesizeTurn(turn, segmentId);
        audioFiles.push(audioFile);

        // Update turn with audio path and duration
        const duration = this.getAudioDuration(audioFile);

        await this.supabase
          .from('conversation_turns')
          .update({
            audio_path: audioFile,
            duration_sec: duration,
          })
          .eq('id', turn.id);

        logger.info({
          turn: turn.turn_number,
          speaker: turn.speaker_name,
          duration,
        }, 'Turn synthesized');

      } catch (error) {
        logger.error({ error, turn: turn.turn_number }, 'Failed to synthesize turn');
        throw error;
      }
    }

    // Concatenate all turns with pauses
    const finalAudio = await this.assembleConversation(audioFiles, segmentId);

    logger.info({
      segmentId,
      turns: turns.length,
      finalAudio,
    }, 'Conversation assembled');

    return finalAudio;
  }

  /**
   * Synthesize a single conversation turn
   */
  private async synthesizeTurn(turn: any, segmentId: string): Promise<string> {
    const voiceId = turn.conversation_participants.djs.voice_id;

    logger.debug({
      turn: turn.turn_number,
      speaker: turn.speaker_name,
      voice: voiceId,
    }, 'Synthesizing turn');

    // Call Piper TTS
    const response = await axios.post(
      `${this.piperUrl}/synthesize`,
      {
        text: turn.text_content,
        model: voiceId,
        speed: 1.0,
        use_cache: true
      },
      {
        timeout: 60000,
      }
    );

    // Decode hex audio to buffer (matching TTSClient pattern)
    const audioBuffer = Buffer.from(response.data.audio, 'hex');

    // Save audio file
    const filename = `${segmentId}_turn${turn.turn_number.toString().padStart(3, '0')}.wav`;
    const filepath = path.join(this.tempDir, filename);

    fs.writeFileSync(filepath, audioBuffer);

    return filepath;
  }

  /**
   * Assemble conversation from individual turn audio files
   */
  private async assembleConversation(
    audioFiles: string[],
    segmentId: string
  ): Promise<string> {
    logger.info({ files: audioFiles.length }, 'Assembling conversation audio');

    // Create file list for FFmpeg concat
    const listFile = path.join(this.tempDir, `${segmentId}_concat.txt`);
    const silenceFile = await this.generateSilence(0.8); // 0.8 second pause

    const fileList: string[] = [];

    for (let i = 0; i < audioFiles.length; i++) {
      fileList.push(`file '${audioFiles[i]}'`);

      // Add pause between turns (except after last turn)
      if (i < audioFiles.length - 1) {
        fileList.push(`file '${silenceFile}'`);
      }
    }

    fs.writeFileSync(listFile, fileList.join('\n'));

    // Concatenate using FFmpeg
    const outputFile = path.join(this.tempDir, `${segmentId}_conversation.wav`);

    try {
      execSync(
        `ffmpeg -f concat -safe 0 -i "${listFile}" -c copy "${outputFile}" -y`,
        { stdio: 'pipe' }
      );

      logger.info({ outputFile }, 'Conversation audio assembled');

      return outputFile;

    } catch (error) {
      logger.error({ error }, 'Failed to concatenate audio');
      throw error;
    }
  }

  /**
   * Generate silence audio file for pauses
   */
  private async generateSilence(durationSec: number): Promise<string> {
    const silenceFile = path.join(this.tempDir, `silence_${durationSec}s.wav`);

    // Check if already exists
    if (fs.existsSync(silenceFile)) {
      return silenceFile;
    }

    // Generate silence using FFmpeg
    execSync(
      `ffmpeg -f lavfi -i anullsrc=r=22050:cl=mono -t ${durationSec} "${silenceFile}" -y`,
      { stdio: 'pipe' }
    );

    return silenceFile;
  }

  /**
   * Get audio file duration
   */
  private getAudioDuration(filepath: string): number {
    try {
      const output = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filepath}"`,
        { encoding: 'utf-8' }
      );

      return parseFloat(output.trim());
    } catch {
      return 0;
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanup(segmentId: string): Promise<void> {
    const pattern = new RegExp(`^${segmentId}_`);
    const files = fs.readdirSync(this.tempDir);

    for (const file of files) {
      if (pattern.test(file)) {
        fs.unlinkSync(path.join(this.tempDir, file));
      }
    }
  }
}
