// Load environment variables from root .env file
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import { ragRouter } from './rag/rag-routes';
import { broadcastScheduleRouter } from './admin/broadcast-schedule-routes';
import { playoutRouter } from './playout/playout-routes';
import { musicRouter } from './music/music-routes';
import { createLogger } from '@radio/core';

const logger = createLogger('api-server');

const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/rag', ragRouter);
app.use('/admin/broadcast-schedule', broadcastScheduleRouter);
app.use('/playout', playoutRouter);
app.use('/music', musicRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(port, () => {
  logger.info({ port }, 'API server started');
});
