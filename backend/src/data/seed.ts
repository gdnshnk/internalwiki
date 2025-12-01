import { graphStore } from '../graph/graph';
import { BaseNode, Edge, NodeType, EdgeType } from '../models/schema';

/**
 * Seed mock data for testing
 * Creates sample knowledge nodes based on Section 5.1 data model
 */
export function seedMockData(): void {
  const now = new Date().toISOString();
  
  // Policy Nodes
  const policy1: BaseNode = {
    id: 'policy-001',
    type: NodeType.POLICY,
    label: 'Underwriting Ratio Threshold',
    description: 'Maximum loan-to-cost and debt-to-GDV ratios for project financing',
    metadata: {
      author: 'Sarah Chen, Risk Officer',
      createdAt: '2023-11-01T00:00:00Z',
      lastModified: '2024-01-15T00:00:00Z',
      modifiedBy: 'Michael Torres, Senior Risk Officer',
      version: '2.0',
      evidenceReferences: ['reg-guidance-2023', 'risk-appetite-framework'],
      jurisdiction: 'UK',
      authorityLevel: 'Board',
      reviewCycle: 'Quarterly',
      validationState: 'validated'
    }
  };

  const policy2: BaseNode = {
    id: 'policy-005',
    type: NodeType.POLICY,
    label: 'Risk Appetite Framework',
    description: 'Overall risk tolerance and capital allocation framework',
    metadata: {
      author: 'Risk Committee',
      createdAt: '2023-06-01T00:00:00Z',
      lastModified: '2023-12-15T00:00:00Z',
      modifiedBy: 'Risk Committee',
      version: '3.1',
      evidenceReferences: ['board-resolution-2023-06'],
      validationState: 'validated'
    }
  };

  // Procedure Nodes
  const procedure1: BaseNode = {
    id: 'procedure-002',
    type: NodeType.PROCEDURE,
    label: 'Due Diligence Workflow',
    description: 'Standard procedure for conducting due diligence on new projects',
    metadata: {
      author: 'Operations Team',
      createdAt: '2023-08-20T00:00:00Z',
      lastModified: '2023-11-20T00:00:00Z',
      modifiedBy: 'Operations Team',
      version: '1.2',
      evidenceReferences: ['sop-manual-v3.2'],
      validationState: 'pending'
    }
  };

  // Precedent Nodes
  const precedent1: BaseNode = {
    id: 'precedent-003',
    type: NodeType.PRECEDENT,
    label: 'Mixed-Use Development Case',
    description: 'Historical precedent for mixed-use development financing and planning',
    metadata: {
      author: 'Project Team',
      createdAt: '2023-09-15T00:00:00Z',
      lastModified: '2024-02-01T00:00:00Z',
      modifiedBy: 'Project Team',
      version: '2.0',
      evidenceReferences: ['case-file-md-2023-045', 'legal-opinion-2023-09'],
      validationState: 'validated'
    }
  };

  // Evidence Nodes
  const evidence1: BaseNode = {
    id: 'evidence-004',
    type: NodeType.EVIDENCE,
    label: 'Regulatory Guidance 2023',
    description: 'Official regulatory guidance document from 2023',
    metadata: {
      author: 'Regulatory Authority',
      createdAt: '2023-01-01T00:00:00Z',
      lastModified: '2023-01-01T00:00:00Z',
      version: '1.0',
      evidenceReferences: [],
      validationState: 'validated'
    }
  };

  // Add nodes to graph
  graphStore.addNode(policy1);
  graphStore.addNode(policy2);
  graphStore.addNode(procedure1);
  graphStore.addNode(precedent1);
  graphStore.addNode(evidence1);

  // Create edges (relationships)
  const edges: Edge[] = [
    {
      id: 'edge-001',
      source: 'policy-001',
      target: 'procedure-002',
      type: EdgeType.DEPENDS_ON
    },
    {
      id: 'edge-002',
      source: 'procedure-002',
      target: 'precedent-003',
      type: EdgeType.REFERENCES
    },
    {
      id: 'edge-003',
      source: 'policy-001',
      target: 'evidence-004',
      type: EdgeType.SUPPORTED_BY
    },
    {
      id: 'edge-004',
      source: 'policy-005',
      target: 'policy-001',
      type: EdgeType.CONSTRAINS
    }
  ];

  edges.forEach(edge => graphStore.addEdge(edge));

  console.log(`Seeded ${graphStore.getGraph().nodes.length} nodes and ${graphStore.getGraph().edges.length} edges`);
}

