import dagre from '@dagrejs/dagre';

export interface LayoutNodeInput {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdgeInput {
  id: string;
  source: string;
  target: string;
  labelWidth?: number;
  labelHeight?: number;
}

export interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  positions: Map<string, NodeBox>;
  width: number;
  height: number;
}

const EMPTY_LAYOUT: LayoutResult = { positions: new Map(), width: 0, height: 0 };

/**
 * Structural fingerprint of a graph. Two graphs with the same signature lay out identically,
 * so callers can skip dagre (and keep every node where it is) when only counts changed.
 */
export function layoutSignature(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]): string {
  const n = nodes.map((node) => `${node.id}:${Math.round(node.width)}x${Math.round(node.height)}`);
  const e = edges.map((edge) => `${edge.source}>${edge.target}`);
  return `${n.join(';')}#${e.join(';')}`;
}

/**
 * Top-to-bottom layered layout, which stacks wide boxes instead of lining them up and so
 * fits the narrow panel at full size. Inputs are sorted before insertion so the result depends only
 * on graph structure, never on the order the world happened to yield entities.
 */
export function layoutGraph(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]): LayoutResult {
  if (nodes.length === 0) return EMPTY_LAYOUT;

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'TB', nodesep: 12, ranksep: 40, edgesep: 10, marginx: 8, marginy: 8 });
  g.setDefaultEdgeLabel(() => ({}));

  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  for (const node of sortedNodes) g.setNode(node.id, { width: node.width, height: node.height });

  const sortedEdges = [...edges].sort((a, b) => a.id.localeCompare(b.id));
  for (const edge of sortedEdges) {
    if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) continue;
    g.setEdge(
      edge.source,
      edge.target,
      { width: edge.labelWidth ?? 0, height: edge.labelHeight ?? 0, labelpos: 'c' },
      edge.id
    );
  }

  dagre.layout(g);

  const positions = new Map<string, NodeBox>();
  for (const node of sortedNodes) {
    const laid = g.node(node.id);
    positions.set(node.id, { x: laid.x, y: laid.y, width: node.width, height: node.height });
  }

  const info = g.graph();
  return { positions, width: info.width ?? 0, height: info.height ?? 0 };
}
