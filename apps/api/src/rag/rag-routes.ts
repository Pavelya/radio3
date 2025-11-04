import { Router, type Router as ExpressRouter } from 'express';
import { RetrievalService } from './retrieval-service';
import { createLogger, type RAGQuery } from '@radio/core';

const logger = createLogger('rag-routes');
const router: ExpressRouter = Router();
const retrievalService = new RetrievalService();

/**
 * POST /rag/retrieve
 * Retrieve relevant chunks for a query
 */
router.post('/retrieve', async (req, res) => {
  try {
    const query: RAGQuery = req.body;

    // Validate
    if (!query.text || query.text.length === 0) {
      return res.status(400).json({
        error: 'Query text is required'
      });
    }

    const result = await retrievalService.retrieve(query);

    res.json(result);

  } catch (error) {
    logger.error({ error }, 'RAG retrieval error');
    res.status(500).json({
      error: 'Retrieval failed'
    });
  }
});

export { router as ragRouter };
