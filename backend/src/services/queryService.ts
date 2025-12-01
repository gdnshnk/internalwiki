import { QueryRequest, QueryResponse } from '../models/schema';
import { graphStore } from '../graph/graph';
import { BaseNode, NodeType } from '../models/schema';

/**
 * Query Processing Service
 * Implements Section 5.2 Reasoning Layer
 */
export class QueryService {
  /**
   * Process a natural language query and return structured response
   */
  async processQuery(request: QueryRequest): Promise<QueryResponse> {
    const { query, role = 'analyst' } = request;
    const lowerQuery = query.toLowerCase();

    // Simple keyword matching for MVP
    // In production, this would use NLP/LLM
    
    // Check for specific query patterns
    if (lowerQuery.includes('financing proposal') || lowerQuery.includes('structure')) {
      return this.getFinancingProposalResponse(role);
    }
    
    if (lowerQuery.includes('underwriting') || lowerQuery.includes('ratio')) {
      return this.getUnderwritingRatiosResponse(role);
    }
    
    if (lowerQuery.includes('due diligence') || lowerQuery.includes('procedure')) {
      return this.getDueDiligenceResponse(role);
    }
    
    // Generic search
    const searchResults = graphStore.search(query);
    
    if (searchResults.length > 0) {
      return {
        structured: true,
        content: {
          nodes: searchResults.map(n => n.label),
          count: searchResults.length
        },
        nodes: searchResults.map(n => n.id)
      };
    }
    
    // Default response
    return {
      structured: true,
      content: {
        message: 'I understand your query. Here is the relevant institutional logic...',
        policies: 'Relevant policies found',
        procedures: 'Applicable procedures identified',
        evidence: 'Supporting evidence available'
      }
    };
  }

  /**
   * Get financing proposal structured response
   */
  private getFinancingProposalResponse(role: string): QueryResponse {
    const baseContent: Record<string, any> = {
      underwritingRatios: 'Loan-to-cost: 70% max, Debt-to-GDV: 60% max',
      jurisdictionalConstraints: 'Planning conditions must be satisfied prior to funding',
      mandatoryCovenants: 'Environmental impact assessment, Site safety certification',
      historicalDeals: '3 similar deals in past 12 months',
      proceduralSteps: ['Initial assessment', 'Due diligence', 'Board approval', 'Contract execution'],
      complianceDeclarations: 'AML check required, Regulatory filing within 30 days'
    };

    // Role-based filtering (Section 7.5)
    if (role === 'senior') {
      baseContent.exceptionPathways = 'Senior approval available for ratios up to 75%';
      baseContent.precedentDeals = 'See precedent cases: MD-2023-045, FD-2023-089';
      baseContent.alternativeStructures = 'Mezzanine financing options available';
    }

    return {
      structured: true,
      content: baseContent
    };
  }

  /**
   * Get underwriting ratios response
   */
  private getUnderwritingRatiosResponse(role: string): QueryResponse {
    const nodes = graphStore.getNodesByType(NodeType.POLICY);
    const ratioPolicy = nodes.find(n => n.label.toLowerCase().includes('ratio'));
    
    const content: Record<string, any> = {
      loanToCost: 'Maximum 70%',
      debtToGDV: 'Maximum 60%',
      evidence: 'Based on Regulatory Guidance 2023 and Risk Appetite Framework',
      lastReview: '2024-01-15'
    };

    if (role === 'senior') {
      content.exceptions = 'Senior approval required for ratios above 65%';
      content.historicalVariations = 'Previous exceptions granted in 3 cases';
      content.stressTestResults = 'Ratios tested against 2008 financial crisis scenarios';
    }

    if (ratioPolicy) {
      content.nodeId = ratioPolicy.id;
      content.metadata = ratioPolicy.metadata;
    }

    return {
      structured: true,
      content,
      nodes: ratioPolicy ? [ratioPolicy.id] : []
    };
  }

  /**
   * Get due diligence procedure response
   */
  private getDueDiligenceResponse(role: string): QueryResponse {
    const nodes = graphStore.getNodesByType(NodeType.PROCEDURE);
    const dueDiligence = nodes.find(n => n.label.toLowerCase().includes('due diligence'));
    
    const content: Record<string, any> = {
      proceduralSteps: [
        'Initial assessment',
        'Documentation review',
        'Site inspection',
        'Compliance verification',
        'Risk assessment',
        'Board approval'
      ],
      evidenceRequired: ['Financial statements', 'Planning permissions', 'Environmental reports'],
      approvalGates: ['Operations Manager', 'Risk Committee', 'Board']
    };

    if (dueDiligence) {
      content.nodeId = dueDiligence.id;
      content.metadata = dueDiligence.metadata;
    }

    return {
      structured: true,
      content,
      nodes: dueDiligence ? [dueDiligence.id] : []
    };
  }

  /**
   * Get nodes related to a query
   */
  getRelatedNodes(query: string, maxNodes: number = 5): BaseNode[] {
    const searchResults = graphStore.search(query);
    const related: BaseNode[] = [];
    
    // Get neighbors of search results
    searchResults.slice(0, 3).forEach(node => {
      const neighbors = graphStore.getNeighbors(node.id);
      related.push(...neighbors);
    });
    
    // Remove duplicates and limit
    const unique = new Map<string, BaseNode>();
    [...searchResults, ...related].forEach(node => {
      if (!unique.has(node.id) && unique.size < maxNodes) {
        unique.set(node.id, node);
      }
    });
    
    return Array.from(unique.values());
  }
}

export const queryService = new QueryService();

