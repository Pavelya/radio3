import { spawn } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import { createLogger } from '@radio/core';
import * as path from 'path';

const logger = createLogger('piper-wrapper');

export interface SynthesisOptions {
  text: string;
  model: string;
  speed: number;
}

export interface SynthesisResult {
  audioPath: string;
  durationSec: number;
  model: string;
}

/**
 * Wrapper for Piper TTS binary
 */
export class PiperWrapper {
  private readonly piperBinary: string;
  private readonly modelsPath: string;

  constructor() {
    this.piperBinary = process.env.PIPER_BINARY_PATH || '/usr/local/bin/piper';
    this.modelsPath = process.env.PIPER_MODELS_PATH || '/opt/piper-models';

    logger.info({
      binary: this.piperBinary,
      modelsPath: this.modelsPath
    }, 'Piper wrapper initialized');
  }

  /**
   * Synthesize speech from text
   */
  async synthesize(options: SynthesisOptions): Promise<SynthesisResult> {
    const { text, model, speed } = options;

    logger.info({ model, textLength: text.length, speed }, 'Synthesizing speech');

    // Validate model exists
    const modelPath = path.join(this.modelsPath, `${model}.onnx`);

    try {
      await fs.access(modelPath);
    } catch {
      throw new Error(`Model not found: ${model}`);
    }

    // Create temp output file
    const outputPath = path.join('/tmp', `piper-${Date.now()}.wav`);

    // Run Piper
    const startTime = Date.now();

    await this.runPiper(text, modelPath, outputPath, speed);

    const duration = Date.now() - startTime;

    // Get audio duration
    const audioDuration = await this.getAudioDuration(outputPath);

    logger.info({
      model,
      synthesisTime: duration,
      audioDuration
    }, 'Synthesis complete');

    return {
      audioPath: outputPath,
      durationSec: audioDuration,
      model
    };
  }

  /**
   * Run Piper binary
   */
  private runPiper(
    text: string,
    modelPath: string,
    outputPath: string,
    speed: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const lengthScale = 1.0 / speed; // Piper uses inverse speed

      const args = [
        '--model', modelPath,
        '--output_file', outputPath,
        '--length_scale', lengthScale.toString()
      ];

      logger.debug({ args }, 'Running Piper');

      const piper = spawn(this.piperBinary, args);

      // Pipe text to stdin
      piper.stdin.write(text);
      piper.stdin.end();

      let stderr = '';

      piper.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      piper.on('close', (code) => {
        if (code !== 0) {
          logger.error({ code, stderr }, 'Piper failed');
          reject(new Error(`Piper failed with code ${code}: ${stderr}`));
        } else {
          resolve();
        }
      });

      piper.on('error', (error) => {
        logger.error({ error }, 'Piper spawn error');
        reject(error);
      });
    });
  }

  /**
   * Get audio file duration using ffprobe
   */
  private async getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);

      let output = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('ffprobe failed'));
        } else {
          resolve(parseFloat(output.trim()));
        }
      });
    });
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.modelsPath);
      const models = files
        .filter(f => f.endsWith('.onnx'))
        .map(f => f.replace('.onnx', ''));

      return models;
    } catch (error) {
      logger.error({ error }, 'Failed to list models');
      return [];
    }
  }
}
