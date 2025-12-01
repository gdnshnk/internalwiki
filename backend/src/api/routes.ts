import { Router, Request, Response } from 'express';
import { QueryRequestSchema } from '../models/schema';
import { queryService } from '../services/queryService';
import { graphStore } from '../graph/graph';
import { BaseNode, Edge } from '../models/schema';

const router = Router();

/**
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'InternalWiki.com API' });
});

/**
 * Query endpoint - processes natural language queries
 * POST /api/query
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const validated = QueryRequestSchema.parse(req.body);
    const response = await queryService.processQuery(validated);
    res.json(response);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Invalid query request' });
  }
});

/**
 * Get all nodes
 * GET /api/nodes
 */
router.get('/nodes', (req: Request, res: Response) => {
  const graph = graphStore.getGraph();
  res.json({ nodes: graph.nodes });
});

/**
 * Get node by ID
 * GET /api/nodes/:id
 */
router.get('/nodes/:id', (req: Request, res: Response) => {
  const node = graphStore.getNode(req.params.id);
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }
  res.json(node);
});

/**
 * Get graph structure
 * GET /api/graph
 */
router.get('/graph', (req: Request, res: Response) => {
  const graph = graphStore.getGraph();
  res.json(graph);
});

/**
 * Create a node
 * POST /api/nodes
 */
router.post('/nodes', (req: Request, res: Response) => {
  try {
    // Basic validation - in production, use full schema validation
    const node = req.body as BaseNode;
    graphStore.addNode(node);
    res.status(201).json(node);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Invalid node data' });
  }
});

/**
 * Get edges for a node
 * GET /api/nodes/:id/edges
 */
router.get('/nodes/:id/edges', (req: Request, res: Response) => {
  const direction = req.query.direction as 'incoming' | 'outgoing' | 'both' || 'both';
  const edges = graphStore.getEdges(req.params.id, direction);
  res.json({ edges });
});

/**
 * Get neighbors of a node
 * GET /api/nodes/:id/neighbors
 */
router.get('/nodes/:id/neighbors', (req: Request, res: Response) => {
  const neighbors = graphStore.getNeighbors(req.params.id);
  res.json({ neighbors });
});

export default router;

