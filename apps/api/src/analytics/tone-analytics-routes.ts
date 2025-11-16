import { Router, type Router as ExpressRouter } from 'express';
import { getDb } from '../db';
import { createLogger } from '@radio/core';

const logger = createLogger('tone-analytics-routes');
const router: ExpressRouter = Router();

interface DailyMetrics {
  date: string;
  segments_analyzed: number;
  avg_tone_score: number;
  avg_optimism_pct: number;
  avg_realism_pct: number;
  avg_wonder_pct: number;
  dystopian_flags: number;
  fantasy_flags: number;
  anachronism_flags: number;
  major_contradictions: number;
  segments_below_threshold: number;
}

/**
 * POST /analytics/tone/aggregate
 * Aggregate tone metrics for a specific date (defaults to today)
 */
router.post('/aggregate', async (req, res) => {
  try {
    const db = getDb();
    const targetDate = req.body.date || new Date().toISOString().split('T')[0];

    logger.info({ targetDate }, 'Aggregating tone metrics');

    // Calculate date range for the target date
    const startDate = `${targetDate}T00:00:00Z`;
    const endDate = new Date(new Date(targetDate).getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0] + 'T00:00:00Z';

    // Get all segments created on target date with tone scores
    const { data: segments, error: segmentsError } = await db
      .from('segments')
      .select('tone_score, tone_balance, validation_issues')
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .not('tone_score', 'is', null);

    if (segmentsError) {
      logger.error({ error: segmentsError }, 'Failed to fetch segments');
      return res.status(500).json({ error: 'Failed to fetch segments' });
    }

    if (!segments || segments.length === 0) {
      // No data for this date
      const emptyMetrics = {
        date: targetDate,
        segments_analyzed: 0,
        avg_tone_score: 0,
        avg_optimism_pct: 0,
        avg_realism_pct: 0,
        avg_wonder_pct: 0,
        dystopian_flags: 0,
        fantasy_flags: 0,
        anachronism_flags: 0,
        major_contradictions: 0,
        segments_below_threshold: 0
      };

      // Still save to database for historical record
      await db.from('tone_metrics_daily').upsert(emptyMetrics);
      return res.json(emptyMetrics);
    }

    // Calculate aggregate metrics
    const totalSegments = segments.length;
    const totalScore = segments.reduce((sum, s) => sum + (s.tone_score || 0), 0);
    const avgScore = totalScore / totalSegments;

    // Parse tone balance percentages
    const optimismPcts: number[] = [];
    const realismPcts: number[] = [];
    const wonderPcts: number[] = [];

    for (const segment of segments) {
      if (segment.tone_balance) {
        const parts = segment.tone_balance.split('/');
        if (parts.length === 3) {
          optimismPcts.push(parseInt(parts[0]));
          realismPcts.push(parseInt(parts[1]));
          wonderPcts.push(parseInt(parts[2]));
        }
      }
    }

    // Count issue types
    let dystopianFlags = 0;
    let fantasyFlags = 0;
    let anachronismFlags = 0;

    for (const segment of segments) {
      const issues = segment.validation_issues || [];
      for (const issue of issues) {
        const issueLower = typeof issue === 'string' ? issue.toLowerCase() : '';
        if (issueLower.includes('dystopian')) {
          dystopianFlags++;
        } else if (issueLower.includes('fantasy')) {
          fantasyFlags++;
        } else if (issueLower.includes('anachronis')) {
          anachronismFlags++;
        }
      }
    }

    // Count major contradictions from lore_contradictions table
    const { count: majorContradictions } = await db
      .from('lore_contradictions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .eq('severity', 'major');

    // Count segments below quality threshold
    const belowThreshold = segments.filter(s => (s.tone_score || 0) < 70).length;

    // Prepare metrics object
    const metrics: DailyMetrics = {
      date: targetDate,
      segments_analyzed: totalSegments,
      avg_tone_score: Math.round(avgScore * 100) / 100,
      avg_optimism_pct: optimismPcts.length > 0
        ? Math.round((optimismPcts.reduce((a, b) => a + b, 0) / optimismPcts.length) * 100) / 100
        : 0,
      avg_realism_pct: realismPcts.length > 0
        ? Math.round((realismPcts.reduce((a, b) => a + b, 0) / realismPcts.length) * 100) / 100
        : 0,
      avg_wonder_pct: wonderPcts.length > 0
        ? Math.round((wonderPcts.reduce((a, b) => a + b, 0) / wonderPcts.length) * 100) / 100
        : 0,
      dystopian_flags: dystopianFlags,
      fantasy_flags: fantasyFlags,
      anachronism_flags: anachronismFlags,
      major_contradictions: majorContradictions || 0,
      segments_below_threshold: belowThreshold
    };

    // Store in database (upsert to handle re-running for same date)
    const { error: upsertError } = await db
      .from('tone_metrics_daily')
      .upsert(metrics);

    if (upsertError) {
      logger.error({ error: upsertError }, 'Failed to store metrics');
      return res.status(500).json({ error: 'Failed to store metrics' });
    }

    logger.info({ metrics }, 'Tone metrics aggregated successfully');
    res.json(metrics);

  } catch (error) {
    logger.error({ error }, 'Tone aggregation error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /analytics/tone/trends
 * Get tone trends over the past N days (default 7)
 */
router.get('/trends', async (req, res) => {
  try {
    const db = getDb();
    const days = parseInt(req.query.days as string) || 7;

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const { data: metrics, error } = await db
      .from('tone_metrics_daily')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (error) {
      logger.error({ error }, 'Failed to fetch trends');
      return res.status(500).json({ error: 'Failed to fetch trends' });
    }

    if (!metrics || metrics.length === 0) {
      return res.json({
        trend: 'insufficient_data',
        period_days: days,
        data_points: 0
      });
    }

    // Calculate trend indicators
    const avgScores = metrics
      .filter(m => m.avg_tone_score != null)
      .map(m => m.avg_tone_score);

    const avgOptimism = metrics
      .filter(m => m.avg_optimism_pct != null)
      .map(m => m.avg_optimism_pct);

    const trend = {
      period_days: days,
      data_points: metrics.length,
      current_avg_score: avgScores.length > 0 ? avgScores[avgScores.length - 1] : 0,
      score_trend: avgScores.length > 1 && avgScores[avgScores.length - 1] > avgScores[0]
        ? 'improving'
        : 'declining',
      optimism_trend: avgOptimism.length > 1 && avgOptimism[avgOptimism.length - 1] > avgOptimism[0]
        ? 'increasing'
        : 'decreasing',
      total_segments: metrics.reduce((sum, m) => sum + m.segments_analyzed, 0),
      total_issues: metrics.reduce((sum, m) =>
        sum + m.dystopian_flags + m.fantasy_flags + m.anachronism_flags, 0
      ),
      metrics
    };

    res.json(trend);

  } catch (error) {
    logger.error({ error }, 'Trends fetch error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /analytics/tone/recommendations
 * Get actionable recommendations based on latest metrics
 */
router.get('/recommendations', async (req, res) => {
  try {
    const db = getDb();

    // Get latest metrics
    const { data: latestMetrics, error } = await db
      .from('tone_metrics_daily')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (error || !latestMetrics) {
      return res.json({ recommendations: ['No metrics available yet'] });
    }

    const recommendations: string[] = [];

    // Check optimism/realism/wonder balance
    const opt = latestMetrics.avg_optimism_pct || 0;
    const real = latestMetrics.avg_realism_pct || 0;
    const wonder = latestMetrics.avg_wonder_pct || 0;

    if (opt < 50) {
      recommendations.push('⚠️ Optimism too low - Add more achievements, successes, and positive outcomes');
    } else if (opt > 70) {
      recommendations.push('⚠️ Optimism too high - Include more realistic challenges and limitations');
    }

    if (real < 20) {
      recommendations.push('⚠️ Realism too low - Incorporate more practical problems and constraints');
    } else if (real > 40) {
      recommendations.push('⚠️ Too much focus on problems - Balance with solutions and progress');
    }

    if (wonder < 5) {
      recommendations.push('💡 Add more sense of wonder - Include discoveries, mysteries, cosmic perspective');
    }

    // Check issue flags
    if (latestMetrics.dystopian_flags > 2) {
      recommendations.push('🚫 Too many dystopian elements - Review prompts for pessimistic language');
    }

    if (latestMetrics.fantasy_flags > 1) {
      recommendations.push('🚫 Fantasy elements detected - Ensure all phenomena have technological explanations');
    }

    if (latestMetrics.major_contradictions > 0) {
      recommendations.push('⚠️ Major lore contradictions found - Review and update knowledge base');
    }

    // Quality threshold
    const lowQualityPct = latestMetrics.segments_analyzed > 0
      ? latestMetrics.segments_below_threshold / latestMetrics.segments_analyzed
      : 0;

    if (lowQualityPct > 0.2) {
      recommendations.push('📉 Over 20% of segments below quality threshold - Review generation prompts');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Tone balance is healthy - Continue current approach');
    }

    res.json({ recommendations, metrics: latestMetrics });

  } catch (error) {
    logger.error({ error }, 'Recommendations error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as toneAnalyticsRouter };
