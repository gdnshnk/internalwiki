-- Vector search optimization migration
-- Adds HNSW index for faster vector similarity searches
-- Reduces k-nearest neighbors retrieval pool for better performance

-- Create HNSW index on chunk_embeddings for faster vector searches
-- HNSW (Hierarchical Navigable Small World) is more efficient than IVFFlat for large datasets
CREATE INDEX IF NOT EXISTS chunk_embeddings_hnsw_idx
ON chunk_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Add index on organization_id + chunk_id for faster lookups
CREATE INDEX IF NOT EXISTS chunk_embeddings_org_chunk_idx
ON chunk_embeddings(organization_id, chunk_id);

-- Optimize document_chunks lookup
CREATE INDEX IF NOT EXISTS document_chunks_version_idx
ON document_chunks(organization_id, document_version_id, chunk_index);

-- Add composite index for document version lookups
CREATE INDEX IF NOT EXISTS document_versions_doc_hash_idx
ON document_versions(organization_id, document_id, content_hash);

-- Optimize source_scores lookup
CREATE INDEX IF NOT EXISTS source_scores_version_idx
ON source_scores(organization_id, document_version_id);

-- Add index for document search by organization and updated_at
CREATE INDEX IF NOT EXISTS documents_org_updated_idx
ON documents(organization_id, updated_at DESC);

-- Analyze tables to update statistics
ANALYZE chunk_embeddings;
ANALYZE document_chunks;
ANALYZE document_versions;
ANALYZE documents;
ANALYZE source_scores;
