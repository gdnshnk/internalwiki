# InternalWiki.com Backend API

Backend API server for InternalWiki.com knowledge infrastructure platform.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Run in development mode:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
npm start
```

## API Endpoints

### Health Check
- `GET /health` - Service health status

### Query
- `POST /api/query` - Process natural language query
  ```json
  {
    "query": "How do I structure a financing proposal?",
    "role": "analyst"
  }
  ```

### Nodes
- `GET /api/nodes` - Get all nodes
- `GET /api/nodes/:id` - Get node by ID
- `POST /api/nodes` - Create a new node
- `GET /api/nodes/:id/edges` - Get edges for a node
- `GET /api/nodes/:id/neighbors` - Get neighboring nodes

### Graph
- `GET /api/graph` - Get full graph structure

## Architecture

- **Models**: Data schemas and types (`src/models/`)
- **Graph**: Knowledge graph storage layer (`src/graph/`)
- **Services**: Business logic (`src/services/`)
- **API**: Express routes (`src/api/`)

## Development

The server runs on `http://localhost:3000` by default.

Mock data is automatically seeded on server startup.

