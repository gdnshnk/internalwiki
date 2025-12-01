import { z } from 'zod';

// Node Types from Section 5.1
export enum NodeType {
  POLICY = 'Policy',
  CLAIM = 'Claim',
  DECISION = 'Decision',
  PRECEDENT = 'Precedent',
  PROCEDURE = 'Procedure',
  EVIDENCE = 'Evidence',
  TEMPLATE = 'Template',
  WORKFLOW = 'Workflow',
  REGULATORY_PROVISION = 'RegulatoryProvision',
  CONTRACTUAL_CLAUSE = 'ContractualClause'
}

// Edge/Relationship Types from Section 5.1
export enum EdgeType {
  DEPENDS_ON = 'depends_on',
  REFERENCES = 'references',
  SUPPORTED_BY = 'supported_by',
  CONSTRAINS = 'constrains',
  SUPERSEDES = 'supersedes',
  TRIGGERS = 'triggers',
  REQUIRES = 'requires',
  APPLIES_TO = 'applies_to'
}

// Metadata Schema
export const MetadataSchema = z.object({
  author: z.string(),
  createdAt: z.string().datetime(),
  lastModified: z.string().datetime(),
  modifiedBy: z.string().optional(),
  version: z.string(),
  evidenceReferences: z.array(z.string()).default([]),
  jurisdiction: z.string().optional(),
  authorityLevel: z.string().optional(),
  reviewCycle: z.string().optional(),
  expiryDate: z.string().datetime().optional(),
  validationState: z.enum(['validated', 'pending', 'provisional', 'expired']).default('provisional')
});

export type Metadata = z.infer<typeof MetadataSchema>;

// Base Node Schema
export const BaseNodeSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(NodeType),
  label: z.string(),
  description: z.string().optional(),
  metadata: MetadataSchema
});

export type BaseNode = z.infer<typeof BaseNodeSchema>;

// Policy Node Schema
export const PolicyNodeSchema = BaseNodeSchema.extend({
  type: z.literal(NodeType.POLICY),
  applicability: z.object({
    scope: z.string(),
    conditions: z.array(z.string()).default([]),
    exceptions: z.array(z.string()).default([])
  }),
  thresholds: z.record(z.any()).optional(),
  constraints: z.array(z.string()).default([])
});

// Procedure Node Schema
export const ProcedureNodeSchema = BaseNodeSchema.extend({
  type: z.literal(NodeType.PROCEDURE),
  steps: z.array(z.object({
    order: z.number(),
    description: z.string(),
    required: z.boolean().default(true),
    evidenceRequired: z.boolean().default(false),
    approvalLevel: z.string().optional()
  })),
  dependencies: z.array(z.string()).default([])
});

// Precedent Node Schema
export const PrecedentNodeSchema = BaseNodeSchema.extend({
  type: z.literal(NodeType.PRECEDENT),
  scenario: z.string(),
  reasoning: z.string(),
  outcome: z.string(),
  appliedLogic: z.array(z.string()).default([]),
  postMortem: z.string().optional()
});

// Evidence Node Schema
export const EvidenceNodeSchema = BaseNodeSchema.extend({
  type: z.literal(NodeType.EVIDENCE),
  source: z.string(),
  sourceType: z.enum(['statute', 'regulation', 'contract', 'precedent', 'internal', 'technical']),
  citation: z.string().optional(),
  date: z.string().datetime().optional(),
  validity: z.enum(['current', 'superseded', 'disputed']).default('current')
});

// Edge Schema
export const EdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.nativeEnum(EdgeType),
  weight: z.number().optional(),
  metadata: z.record(z.any()).optional()
});

export type Edge = z.infer<typeof EdgeSchema>;

// Knowledge Graph Schema
export const KnowledgeGraphSchema = z.object({
  nodes: z.array(BaseNodeSchema),
  edges: z.array(EdgeSchema)
});

export type KnowledgeGraph = z.infer<typeof KnowledgeGraphSchema>;

// Query Request Schema
export const QueryRequestSchema = z.object({
  query: z.string(),
  role: z.enum(['analyst', 'senior', 'compliance', 'manager']).optional(),
  context: z.record(z.any()).optional()
});

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

// Query Response Schema
export const QueryResponseSchema = z.object({
  structured: z.boolean(),
  content: z.record(z.any()),
  nodes: z.array(z.string()).optional(),
  reasoning: z.string().optional()
});

export type QueryResponse = z.infer<typeof QueryResponseSchema>;

