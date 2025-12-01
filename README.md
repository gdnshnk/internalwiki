# InternalWiki.com

A foundational knowledge infrastructure standard for organizations.

## Overview

InternalWiki.com transforms institutional knowledge from static documentation into structured, machine-readable logic capable of being queried, validated, traced, and executed.

## Project Status

🚧 **Phase I - Foundation** - Backend API and frontend UI implemented

## Architecture

- **Knowledge Graph**: Semantic representation of institutional logic
- **Reasoning Layer**: Symbolic and model-driven inference
- **Integration Layer**: Document ingestion and system APIs
- **Governance**: Validation, review cycles, and provenance tracking

## Getting Started

### Frontend

1. Open `index.html` in a web browser (Safari, Chrome, etc.)

### Backend API

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. The API will run on `http://localhost:3000`

### Full Stack

1. Start the backend API (see above)
2. Open `index.html` in a browser
3. The frontend will automatically connect to the backend API

## Project Structure

- `index.html` - Frontend UI (Grokipedia-inspired design)
- `styles.css` - Frontend styling
- `app.js` - Frontend JavaScript
- `backend/` - Backend API server
  - `src/models/` - Data model schemas
  - `src/graph/` - Knowledge graph storage
  - `src/services/` - Business logic
  - `src/api/` - API routes

## API Endpoints

- `POST /api/query` - Process natural language queries
- `GET /api/nodes` - Get all knowledge nodes
- `GET /api/graph` - Get full graph structure
- `GET /health` - Health check

See `backend/README.md` for detailed API documentation.

## License

TBD

