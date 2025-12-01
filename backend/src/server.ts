import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './api/routes';
import { seedMockData } from './data/seed';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    service: 'InternalWiki.com API',
    version: '0.1.0',
    status: 'running'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`InternalWiki.com API server running on http://localhost:${PORT}`);
  
  // Seed mock data on startup
  seedMockData();
  console.log('Mock data seeded');
});

export default app;

