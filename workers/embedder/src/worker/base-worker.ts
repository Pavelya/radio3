import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger, type WorkerConfig, type ClaimedJob } from '@radio/core';

const logger = createLogger('base-worker');

/**
 * Base worker class with job claiming and lifecycle management
 */
export abstract class BaseWorker {
  protected db: SupabaseClient;
  protected config: WorkerConfig;
  protected running: boolean = false;
  protected jobsInFlight: number = 0;

  constructor(config: WorkerConfig) {
    this.config = config;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    }

    this.db = createClient(supabaseUrl, supabaseKey);

    logger.info({ config }, 'Worker initialized');
  }

  /**
   * Start worker (main loop)
   */
  async start(): Promise<void> {
    this.running = true;

    logger.info({ workerType: this.config.workerType }, 'Worker starting');

    // Setup LISTEN for job notifications
    await this.setupListener();

    // Start heartbeat
    this.startHeartbeat();

    // Initial job check
    await this.checkForJobs();

    // Keep process alive
    await new Promise(() => {}); // Will be interrupted by SIGTERM
  }

  /**
   * Stop worker gracefully
   */
  async stop(): Promise<void> {
    logger.info('Worker stopping');
    this.running = false;

    // Wait for in-flight jobs to complete
    while (this.jobsInFlight > 0) {
      logger.info({ jobsInFlight: this.jobsInFlight }, 'Waiting for jobs to complete');
      await this.sleep(1000);
    }

    logger.info('Worker stopped');
  }

  /**
   * Setup LISTEN for new job notifications
   */
  private async setupListener(): Promise<void> {
    const channel = `new_job_${this.config.workerType}`;

    logger.info({ channel }, 'Setting up listener');

    // Create a raw SQL connection for LISTEN
    const { data, error } = await this.db.rpc('exec_sql', {
      sql: `LISTEN ${channel}`
    });

    if (error) {
      logger.error({ error }, 'Failed to setup listener');
      throw error;
    }

    // Poll for notifications (Supabase doesn't expose NOTIFY directly)
    setInterval(() => this.checkForJobs(), 5000);
  }

  /**
   * Check for available jobs
   */
  private async checkForJobs(): Promise<void> {
    if (!this.running) return;
    if (this.jobsInFlight >= this.config.maxConcurrentJobs) return;

    try {
      const job = await this.claimJob();

      if (job) {
        this.jobsInFlight++;

        // Process job in background
        this.processJob(job)
          .catch(error => {
            logger.error({ error, jobId: job.job_id }, 'Job processing error');
          })
          .finally(() => {
            this.jobsInFlight--;
          });

        // Check for more jobs immediately
        setImmediate(() => this.checkForJobs());
      }
    } catch (error) {
      logger.error({ error }, 'Failed to check for jobs');
    }
  }

  /**
   * Claim next available job
   */
  private async claimJob(): Promise<ClaimedJob | null> {
    const { data, error } = await this.db.rpc('claim_job', {
      p_job_type: this.config.workerType,
      p_worker_id: this.config.instanceId,
      p_lease_seconds: this.config.leaseSeconds
    });

    if (error) {
      logger.error({ error }, 'Failed to claim job');
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const job = data[0];
    logger.info({ jobId: job.job_id, attempt: job.attempts }, 'Job claimed');

    return job;
  }

  /**
   * Process a single job
   */
  private async processJob(job: ClaimedJob): Promise<void> {
    const startTime = Date.now();

    try {
      // Call abstract handler
      await this.handleJob(job);

      // Mark complete
      const { error } = await this.db.rpc('complete_job', {
        p_job_id: job.job_id
      });

      if (error) throw error;

      const duration = Date.now() - startTime;
      logger.info({
        jobId: job.job_id,
        duration
      }, 'Job completed');

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({
        jobId: job.job_id,
        error: errorMessage,
        duration
      }, 'Job failed');

      // Mark failed
      await this.db.rpc('fail_job', {
        p_job_id: job.job_id,
        p_error: errorMessage,
        p_error_details: {
          stack: error instanceof Error ? error.stack : undefined,
          attempt: job.attempts,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Send heartbeat
   */
  private startHeartbeat(): void {
    setInterval(async () => {
      if (!this.running) return;

      try {
        const { error } = await this.db
          .from('health_checks')
          .upsert({
            worker_type: this.config.workerType,
            instance_id: this.config.instanceId,
            status: 'healthy',
            last_heartbeat: new Date().toISOString(),
            metrics: {
              jobs_in_flight: this.jobsInFlight,
              uptime_sec: process.uptime()
            }
          });

        if (error) {
          logger.error({ error }, 'Failed to send heartbeat');
        }
      } catch (error) {
        logger.error({ error }, 'Heartbeat error');
      }
    }, this.config.heartbeatInterval * 1000);
  }

  /**
   * Abstract method - implement in subclass
   */
  protected abstract handleJob(job: ClaimedJob): Promise<void>;

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
