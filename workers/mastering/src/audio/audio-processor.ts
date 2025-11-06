import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createLogger, type ProcessingOptions, type ProcessingResult } from '@radio/core';

const logger = createLogger('audio-processor');

/**
 * Audio processor using FFmpeg
 */
export class AudioProcessor {
  private readonly defaultOptions: ProcessingOptions = {
    targetLUFS: -16.0,
    peakLimit: -1.0,
    sampleRate: 48000
  };

  /**
   * Normalize audio to target LUFS
   */
  async normalize(
    inputPath: string,
    options?: Partial<ProcessingOptions>
  ): Promise<ProcessingResult> {
    const opts = { ...this.defaultOptions, ...options };

    logger.info({
      inputPath,
      targetLUFS: opts.targetLUFS,
      peakLimit: opts.peakLimit
    }, 'Normalizing audio');

    const startTime = Date.now();

    // Step 1: Measure current loudness
    const currentLUFS = await this.measureLUFS(inputPath);

    logger.debug({ currentLUFS }, 'Current loudness measured');

    // Step 2: Calculate adjustment
    const adjustment = opts.targetLUFS - currentLUFS;

    logger.debug({ adjustment }, 'Loudness adjustment calculated');

    // Step 3: Apply normalization
    const outputPath = path.join('/tmp', `normalized-${Date.now()}.wav`);

    await this.applyNormalization(
      inputPath,
      outputPath,
      adjustment,
      opts.peakLimit,
      opts.sampleRate
    );

    // Step 4: Verify final loudness
    const finalLUFS = await this.measureLUFS(outputPath);
    const peakDb = await this.measurePeak(outputPath);
    const durationSec = await this.getDuration(outputPath);

    // Step 5: Get file size
    const stats = await fs.stat(outputPath);

    const duration = Date.now() - startTime;

    logger.info({
      duration,
      currentLUFS,
      finalLUFS,
      peakDb,
      adjustment
    }, 'Normalization complete');

    return {
      outputPath,
      lufsIntegrated: finalLUFS,
      peakDb,
      durationSec,
      sizeBytes: stats.size
    };
  }

  /**
   * Measure integrated LUFS using ffmpeg loudnorm filter
   */
  private async measureLUFS(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', filePath,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
        '-f', 'null',
        '-'
      ]);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg failed with code ${code}`));
          return;
        }

        try {
          // Extract JSON from stderr
          const jsonMatch = stderr.match(/\{[\s\S]*?\}/);
          if (!jsonMatch) {
            reject(new Error('Could not parse loudnorm output'));
            return;
          }

          const stats = JSON.parse(jsonMatch[0]);
          resolve(parseFloat(stats.input_i));
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Apply loudness normalization with peak limiting
   */
  private async applyNormalization(
    inputPath: string,
    outputPath: string,
    adjustment: number,
    peakLimit: number,
    sampleRate: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build filter chain
      const filters = [
        `volume=${adjustment}dB`,  // Adjust volume
        `alimiter=limit=${peakLimit}dB`,  // Peak limiting
        `aresample=${sampleRate}`  // Resample
      ];

      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-af', filters.join(','),
        '-ar', sampleRate.toString(),
        '-ac', '1',  // Mono
        '-y',  // Overwrite
        outputPath
      ]);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          logger.error({ code, stderr }, 'ffmpeg normalization failed');
          reject(new Error(`ffmpeg failed with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Measure peak level
   */
  private async measurePeak(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', filePath,
        '-af', 'astats=metadata=1:reset=1',
        '-f', 'null',
        '-'
      ]);

      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('ffmpeg failed'));
          return;
        }

        // Extract peak from stderr
        const peakMatch = stderr.match(/Peak level dB:\s+([-\d.]+)/);
        if (peakMatch) {
          resolve(parseFloat(peakMatch[1]));
        } else {
          // Fallback to 0 if can't parse
          resolve(0);
        }
      });
    });
  }

  /**
   * Get audio duration
   */
  private async getDuration(filePath: string): Promise<number> {
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
   * Validate audio quality
   */
  validateQuality(result: ProcessingResult): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check LUFS is within acceptable range
    if (Math.abs(result.lufsIntegrated - this.defaultOptions.targetLUFS) > 2.0) {
      issues.push(`LUFS ${result.lufsIntegrated} too far from target ${this.defaultOptions.targetLUFS}`);
    }

    // Check peak doesn't exceed limit
    if (result.peakDb > this.defaultOptions.peakLimit) {
      issues.push(`Peak ${result.peakDb}dB exceeds limit ${this.defaultOptions.peakLimit}dB`);
    }

    // Check duration is reasonable
    if (result.durationSec < 5) {
      issues.push(`Duration ${result.durationSec}s is too short`);
    }

    if (result.durationSec > 600) {
      issues.push(`Duration ${result.durationSec}s is too long`);
    }

    // Check file size
    if (result.sizeBytes < 10000) {
      issues.push(`File size ${result.sizeBytes} bytes is suspiciously small`);
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}
