import { BaseNode, Edge, NodeType, EdgeType, KnowledgeGraph } from '../models/schema';

/**
 * In-memory knowledge graph implementation
 * This will be replaced with Neo4j in production
 */
export class KnowledgeGraphStore {
  private nodes: Map<string, BaseNode>;
  private edges: Map<string, Edge>;
  private nodeIndex: Map<NodeType, Set<string>>;

  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.nodeIndex = new Map();
    
    // Initialize index for each node type
    Object.values(NodeType).forEach(type => {
      this.nodeIndex.set(type, new Set());
    });
  }

  /**
   * Add a node to the graph
   */
  addNode(node: BaseNode): void {
    this.nodes.set(node.id, node);
    const typeSet = this.nodeIndex.get(node.type);
    if (typeSet) {
      typeSet.add(node.id);
    }
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): BaseNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes of a specific type
   */
  getNodesByType(type: NodeType): BaseNode[] {
    const ids = this.nodeIndex.get(type) || new Set();
    return Array.from(ids)
      .map(id => this.nodes.get(id))
      .filter((node): node is BaseNode => node !== undefined);
  }

  /**
   * Add an edge to the graph
   */
  addEdge(edge: Edge): void {
    this.edges.set(edge.id, edge);
  }

  /**
   * Get edges connected to a node
   */
  getEdges(nodeId: string, direction: 'incoming' | 'outgoing' | 'both' = 'both'): Edge[] {
    const result: Edge[] = [];
    
    for (const edge of this.edges.values()) {
      if (direction === 'both' || direction === 'outgoing') {
        if (edge.source === nodeId) {
          result.push(edge);
        }
      }
      if (direction === 'both' || direction === 'incoming') {
        if (edge.target === nodeId) {
          result.push(edge);
        }
      }
    }
    
    return result;
  }

  /**
   * Get neighbors of a node
   */
  getNeighbors(nodeId: string): BaseNode[] {
    const edges = this.getEdges(nodeId, 'both');
    const neighborIds = new Set<string>();
    
    edges.forEach(edge => {
      if (edge.source === nodeId) {
        neighborIds.add(edge.target);
      }
      if (edge.target === nodeId) {
        neighborIds.add(edge.source);
      }
    });
    
    return Array.from(neighborIds)
      .map(id => this.nodes.get(id))
      .filter((node): node is BaseNode => node !== undefined);
  }

  /**
   * Traverse graph from a starting node
   */
  traverse(startNodeId: string, maxDepth: number = 3): BaseNode[] {
    const visited = new Set<string>();
    const result: BaseNode[] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }];
    
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      
      if (visited.has(id) || depth > maxDepth) {
        continue;
      }
      
      visited.add(id);
      const node = this.nodes.get(id);
      if (node) {
        result.push(node);
      }
      
      if (depth < maxDepth) {
        const neighbors = this.getNeighbors(id);
        neighbors.forEach(neighbor => {
          if (!visited.has(neighbor.id)) {
            queue.push({ id: neighbor.id, depth: depth + 1 });
          }
        });
      }
    }
    
    return result;
  }

  /**
   * Search nodes by label or description
   */
  search(query: string): BaseNode[] {
    const lowerQuery = query.toLowerCase();
    const results: BaseNode[] = [];
    
    for (const node of this.nodes.values()) {
      if (
        node.label.toLowerCase().includes(lowerQuery) ||
        (node.description && node.description.toLowerCase().includes(lowerQuery))
      ) {
        results.push(node);
      }
    }
    
    return results;
  }

  /**
   * Get full graph structure
   */
  getGraph(): KnowledgeGraph {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values())
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.nodeIndex.forEach(set => set.clear());
  }
}

// Singleton instance
export const graphStore = new KnowledgeGraphStore();

