import express from 'express';
import { ragRouter } from './rag/rag-routes';
import { createLogger } from '@radio/core';

const logger = createLogger('api-server');

const app = express();
const port = process.env.PORT || 8000;

// Middleware
app.use(express.json());

// Routes
app.use('/rag', ragRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(port, () => {
  logger.info({ port }, 'API server started');
});
