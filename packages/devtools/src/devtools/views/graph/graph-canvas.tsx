import type { Entity } from '@koota/core';
import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import styles from './graph-canvas.module.css';
import {
  layoutGraph,
  layoutSignature,
  type LayoutEdgeInput,
  type LayoutNodeInput,
  type LayoutResult,
  type NodeBox,
} from './graph-layout';

export type CanvasNodeVariant = 'single' | 'group';

export interface CanvasNode {
  id: string;
  variant: CanvasNodeVariant;
  /** Text inside the circle: the entity id for a single, the count for a group. */
  label: string;
  /** Group size; drives the radius. */
  count?: number;
  /** Hover card heading. */
  title: string;
  /** Hover card body, e.g. the trait list. */
  detail?: string;
  /** Hovering the node highlights this entity in the world. */
  entity?: Entity;
  /** Singled out by the user. */
  pinned?: boolean;
  /** Set by the canvas on nodes that just disappeared and are lingering. */
  ghost?: boolean;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  count: number;
  /** Set by the canvas on edges that just disappeared and are lingering. */
  ghost?: boolean;
}

interface GraphCanvasProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** Bump to re-fit the viewport, e.g. from a toolbar button. */
  fitSignal?: number;
  /** Identifies what is being shown; when it changes, nothing from the previous view lingers. */
  epoch?: string;
  onNodeClick?: (node: CanvasNode) => void;
  onNodeHover?: (node: CanvasNode | null) => void;
  /** Shown when there are no nodes. */
  children?: ReactNode;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

/* Sizing ------------------------------------------------------------------------------------- */

const LABEL_CHAR_W = 4.7; // glyph width of the 8px edge label font
const BASE_R = 12;
/** Extra radius per doubling of the group size, so a bigger group reads as a bigger node. */
const SIZE_STEP = 3;
const MAX_SIZE_LEVEL = 5;
const TWEEN_MS = 320;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const FIT_PAD = 14;
const DRAG_THRESHOLD = 3;
/** How long a vanished node or edge stays as a ghost before the structure actually changes. */
const LINGER_MS = 2500;

interface MeasuredNode {
  node: CanvasNode;
  radius: number;
}

function sizeLevel(count: number | undefined): number {
  if (count === undefined || count < 2) return 0;
  return Math.min(MAX_SIZE_LEVEL, Math.round(Math.log2(count)));
}

function measure(node: CanvasNode): MeasuredNode {
  return { node, radius: BASE_R + sizeLevel(node.count) * SIZE_STEP };
}

function edgeText(edge: CanvasEdge): string {
  return edge.count > 1 && !edge.ghost ? `${edge.label} ×${edge.count}` : edge.label;
}

/* Lingering ---------------------------------------------------------------------------------- */

/**
 * Keeps items that just left the list around as ghosts for a grace period. Short-lived
 * entities (bullets, particles) otherwise add and remove whole nodes several times a second,
 * and every one of those is a structural change that forces a new layout. Ghost edges only
 * draw while both of their endpoints are still on screen.
 */
function useLinger<T extends { id: string; ghost?: boolean }>(
  items: T[],
  ms: number,
  epoch: string,
  shouldLinger: (item: T) => boolean
): T[] {
  const seenRef = useRef({ epoch, entries: new Map<string, { item: T; expires: number }>() });
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  if (seenRef.current.epoch !== epoch) seenRef.current = { epoch, entries: new Map() };

  const now = performance.now();
  const seen = seenRef.current.entries;
  const live = new Set<string>();
  for (const item of items) {
    live.add(item.id);
    if (shouldLinger(item)) seen.set(item.id, { item, expires: Infinity });
  }

  const result = [...items];
  let nextExpiry = Infinity;
  for (const [id, entry] of seen) {
    if (live.has(id)) continue;
    if (entry.expires === Infinity) entry.expires = now + ms;
    if (entry.expires <= now) {
      seen.delete(id);
      continue;
    }
    result.push({ ...entry.item, ghost: true });
    nextExpiry = Math.min(nextExpiry, entry.expires);
  }

  useEffect(() => {
    if (nextExpiry === Infinity) return;
    const timeout = setTimeout(rerender, Math.max(0, nextExpiry - performance.now()) + 16);
    return () => clearTimeout(timeout);
  }, [nextExpiry]);

  return result;
}

/* Tweening ----------------------------------------------------------------------------------- */

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Eases the shown value toward `target` whenever `target` changes identity. Setting
 * `immediateRef` to true before changing the target snaps instead, for direct manipulation.
 */
function useTween<T>(
  target: T,
  lerp: (from: T, to: T, t: number) => T,
  immediateRef?: RefObject<boolean>
): T {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    if (shownRef.current === target) return;
    if (immediateRef?.current || prefersReducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return;
    }

    const from = shownRef.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / TWEEN_MS);
      const eased = 1 - (1 - t) ** 3;
      const next = t >= 1 ? target : lerp(from, target, eased);
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, lerp, immediateRef]);

  return shown;
}

function lerpPositions(from: LayoutResult, to: LayoutResult, t: number): LayoutResult {
  const positions = new Map<string, NodeBox>();
  for (const [id, box] of to.positions) {
    const prev = from.positions.get(id);
    if (!prev) {
      positions.set(id, box);
      continue;
    }
    positions.set(id, {
      x: prev.x + (box.x - prev.x) * t,
      y: prev.y + (box.y - prev.y) * t,
      width: box.width,
      height: box.height,
    });
  }
  return { positions, width: to.width, height: to.height };
}

function lerpSlots(
  from: Map<string, number>,
  to: Map<string, number>,
  t: number
): Map<string, number> {
  const next = new Map<string, number>();
  for (const [id, slot] of to) {
    const prev = from.get(id);
    next.set(id, prev === undefined ? slot : prev + (slot - prev) * t);
  }
  return next;
}

function lerpView(from: View, to: View, t: number): View {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    scale: from.scale + (to.scale - from.scale) * t,
  };
}

function fitView(layout: LayoutResult, width: number, height: number): View {
  if (layout.width === 0 || layout.height === 0) return { x: 0, y: 0, scale: 1 };
  const scale = Math.max(
    MIN_SCALE,
    Math.min((width - FIT_PAD * 2) / layout.width, (height - FIT_PAD * 2) / layout.height, 1.2)
  );
  return {
    x: (width - layout.width * scale) / 2,
    y: (height - layout.height * scale) / 2,
    scale,
  };
}

/* Edge geometry ------------------------------------------------------------------------------ */

interface EdgeCurve {
  d: string;
  /** Point on the curve at t in [0, 1]; a self loop always answers with its label spot. */
  at: (t: number) => { x: number; y: number };
}

function cubicAt(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  t: number
): { x: number; y: number } {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * x0 + b * x1 + c * x2 + d * x3, y: a * y0 + b * y1 + c * y2 + d * y3 };
}

function edgeCurve(s: NodeBox, t: NodeBox, offset: number, selfLoop: boolean): EdgeCurve {
  if (selfLoop) {
    const right = s.x + s.width / 2;
    const reach = 22 + Math.abs(offset) * 2;
    const y0 = s.y - s.height / 4;
    const y1 = s.y + s.height / 4;
    const label = { x: right + reach * 0.75 + 3, y: s.y };
    return {
      d: `M ${right} ${y0} C ${right + reach} ${y0 - 8}, ${right + reach} ${y1 + 8}, ${right} ${y1}`,
      at: () => label,
    };
  }

  // Flow is top to bottom; a back edge simply runs upward. Circles are anchored on their rim
  // along the line between centers so edges meet them at any angle.
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const dist = Math.hypot(dx, dy) || 1;
  const sx = s.x + (dx / dist) * (s.width / 2) + offset * 0.4;
  const sy = s.y + (dy / dist) * (s.height / 2);
  const ex = t.x - (dx / dist) * (t.width / 2) + offset * 0.4;
  const ey = t.y - (dy / dist) * (t.height / 2);
  const forward = ey >= sy;
  const reach = Math.max(Math.abs(ey - sy) * 0.5, 16);
  const c1y = forward ? sy + reach : sy - reach;
  const c2y = forward ? ey - reach : ey + reach;
  const c1x = sx + offset;
  const c2x = ex + offset;

  return {
    d: `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`,
    at: (u) => cubicAt(sx, sy, c1x, c1y, c2x, c2y, ex, ey, u),
  };
}

/* Label placement ---------------------------------------------------------------------------- */

const LABEL_H = 12;
/** Candidate spots along an edge, tried in order; near the source first. */
const LABEL_SLOTS = [0.2, 0.34, 0.48, 0.62, 0.76, 0.1];
const EDGE_SAMPLES = 12;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function pointInRect(p: { x: number; y: number }, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

function circleMeetsRect(c: NodeBox, r: Rect): boolean {
  const radius = c.width / 2;
  const nx = Math.max(r.x, Math.min(c.x, r.x + r.width));
  const ny = Math.max(r.y, Math.min(c.y, r.y + r.height));
  return Math.hypot(c.x - nx, c.y - ny) < radius;
}

/**
 * Picks where along each edge its label goes. Every label tries the slots in order and takes
 * the first one that touches no placed label, no other edge and no node; failing that, the
 * least crowded one. Decided on the settled layout so labels do not hop while nodes tween.
 */
function placeLabels(
  edges: CanvasEdge[],
  curves: Map<string, EdgeCurve>,
  nodes: NodeBox[],
  previous: Map<string, number>
): Map<string, number> {
  const samples = new Map<string, { x: number; y: number }[]>();
  for (const edge of edges) {
    const curve = curves.get(edge.id);
    if (!curve) continue;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= EDGE_SAMPLES; i++) points.push(curve.at(i / EDGE_SAMPLES));
    samples.set(edge.id, points);
  }

  const placed: Rect[] = [];
  const result = new Map<string, number>();

  for (const edge of edges) {
    const curve = curves.get(edge.id);
    if (!curve) continue;
    const width = edgeText(edge).length * LABEL_CHAR_W + 6;
    let best: { t: number; rect: Rect; score: number } | null = null;

    // A label that already has a clean spot keeps it; only a conflict makes it move.
    const kept = previous.get(edge.id);
    const slots = kept === undefined ? LABEL_SLOTS : [kept, ...LABEL_SLOTS.filter((t) => t !== kept)];

    for (const t of slots) {
      const c = curve.at(t);
      const rect = { x: c.x - width / 2, y: c.y - LABEL_H / 2, width, height: LABEL_H };
      let score = 0;
      for (const other of placed) if (rectsOverlap(rect, other)) score += 10;
      for (const [id, points] of samples) {
        if (id === edge.id) continue;
        for (const p of points) if (pointInRect(p, rect)) score += 1;
      }
      for (const node of nodes) if (circleMeetsRect(node, rect)) score += 5;
      if (best === null || score < best.score) best = { t, rect, score };
      if (score === 0) break;
    }

    if (best) {
      placed.push(best.rect);
      result.set(edge.id, best.t);
    }
  }

  return result;
}

/** Spread parallel edges between the same pair of nodes so they never overlap. */
function parallelOffsets(edges: CanvasEdge[]): Map<string, number> {
  const groups = new Map<string, CanvasEdge[]>();
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join('|');
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(edge);
  }
  const offsets = new Map<string, number>();
  for (const group of groups.values()) {
    group.forEach((edge, i) => offsets.set(edge.id, (i - (group.length - 1) / 2) * 12));
  }
  return offsets;
}

/* Component ---------------------------------------------------------------------------------- */

/**
 * Pannable, zoomable SVG that lays circles out top to bottom. Layout only re-runs when the
 * structure changes, and every change slides nodes to their new place instead of jumping.
 */
export function GraphCanvas({
  nodes: liveNodes,
  edges: liveEdges,
  fitSignal = 0,
  epoch = '',
  onNodeClick,
  onNodeHover,
  children,
}: GraphCanvasProps) {
  // Groups stand for many entities and linger so churn underneath them never moves the layout.
  // Singles stand for one entity each, and their coming and going is information.
  const nodes = useLinger(liveNodes, LINGER_MS, epoch, (node) => node.variant === 'group');
  const edges = useLinger(liveEdges, LINGER_MS, epoch, () => true);
  const markerId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 258, height: 240 });
  const isEmpty = nodes.length === 0;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize((prev) =>
          prev.width === rect.width && prev.height === rect.height
            ? prev
            : { width: rect.width, height: rect.height }
        );
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Layout, cached by structural signature so count changes keep every node in place.
  const measured = useMemo(() => nodes.map(measure), [nodes]);
  const layoutNodes = useMemo<LayoutNodeInput[]>(
    () => measured.map((m) => ({ id: m.node.id, width: m.radius * 2, height: m.radius * 2 })),
    [measured]
  );
  const layoutEdges = useMemo<LayoutEdgeInput[]>(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        labelWidth: edgeText(edge).length * LABEL_CHAR_W + 8,
        labelHeight: 14,
      })),
    [edges]
  );
  const signature = layoutSignature(layoutNodes, layoutEdges);
  const layoutRef = useRef<{ signature: string; result: LayoutResult } | null>(null);
  if (layoutRef.current === null || layoutRef.current.signature !== signature) {
    layoutRef.current = { signature, result: layoutGraph(layoutNodes, layoutEdges) };
  }
  const layout = layoutRef.current.result;
  const shownLayout = useTween(layout, lerpPositions);

  // Viewport auto-fits until the user takes control, then stays put across updates.
  const [autoFit, setAutoFit] = useState(true);
  const [viewTarget, setViewTarget] = useState<View>(() => fitView(layout, size.width, size.height));
  const viewImmediateRef = useRef(false);
  const view = useTween(viewTarget, lerpView, viewImmediateRef);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    if (fitSignal > 0) setAutoFit(true);
  }, [fitSignal]);

  // Lingering keeps the structure steady through churn, so plain auto-fit is calm enough:
  // it only moves when the graph really changed, and it tweens there.
  useEffect(() => {
    if (!autoFit) return;
    viewImmediateRef.current = false;
    setViewTarget(fitView(layout, size.width, size.height));
  }, [autoFit, layout, size, fitSignal]);

  const setUserView = useCallback((next: View) => {
    viewImmediateRef.current = true;
    setAutoFit(false);
    setViewTarget(next);
  }, []);

  // Wheel zoom around the cursor. Native listener so page scrolling can be prevented.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const current = viewRef.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
      const k = scale / current.scale;
      setUserView({ x: mx - (mx - current.x) * k, y: my - (my - current.y) * k, scale });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [setUserView, isEmpty]);

  // Drag to pan. A click that moved past the threshold is swallowed.
  const dragRef = useRef<{ x: number; y: number; view: View } | null>(null);
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, view: viewRef.current };
    movedRef.current = false;
    setDragging(true);
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!movedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      movedRef.current = true;
      setUserView({ x: drag.view.x + dx, y: drag.view.y + dy, scale: drag.view.scale });
    },
    [setUserView]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  // Hover dims everything that does not touch the hovered node and shows its card.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const connected = useMemo(() => {
    if (hoveredId === null) return null;
    const set = new Set<string>([hoveredId]);
    for (const edge of edges) {
      if (edge.source === hoveredId) set.add(edge.target);
      else if (edge.target === hoveredId) set.add(edge.source);
    }
    return set;
  }, [hoveredId, edges]);

  const hoverNode = useCallback(
    (node: CanvasNode | null) => {
      setHoveredId(node ? node.id : null);
      onNodeHover?.(node);
    },
    [onNodeHover]
  );

  const offsets = useMemo(() => parallelOffsets(edges), [edges]);
  const previousSlotsRef = useRef(new Map<string, number>());
  const labelSlots = useMemo(() => {
    const curves = new Map<string, EdgeCurve>();
    for (const edge of edges) {
      const s = layout.positions.get(edge.source);
      const t = layout.positions.get(edge.target);
      if (s && t) {
        curves.set(edge.id, edgeCurve(s, t, offsets.get(edge.id) ?? 0, edge.source === edge.target));
      }
    }
    const slots = placeLabels(
      edges,
      curves,
      [...layout.positions.values()],
      previousSlotsRef.current
    );
    previousSlotsRef.current = slots;
    return slots;
  }, [edges, layout, offsets]);
  // A label that does move slides along its edge rather than jumping.
  const shownSlots = useTween(labelSlots, lerpSlots);

  if (isEmpty) {
    return (
      <div ref={wrapperRef} className={styles.wrapper}>
        {children}
      </div>
    );
  }

  const boxFor = (id: string) => shownLayout.positions.get(id) ?? layout.positions.get(id);
  const hovered = hoveredId !== null ? measured.find((m) => m.node.id === hoveredId) : undefined;
  const hoveredBox = hovered ? boxFor(hovered.node.id) : undefined;

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        className={`${styles.svg} ${dragging ? styles.dragging : ''}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrow} />
          </marker>
        </defs>

        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          <g>
            {edges.map((edge) => {
              const s = boxFor(edge.source);
              const t = boxFor(edge.target);
              if (!s || !t) return null;
              const curve = edgeCurve(s, t, offsets.get(edge.id) ?? 0, edge.source === edge.target);
              const label = curve.at(shownSlots.get(edge.id) ?? LABEL_SLOTS[0]);
              const dimmed =
                connected !== null && edge.source !== hoveredId && edge.target !== hoveredId;
              return (
                <g
                  key={edge.id}
                  className={[styles.edge, dimmed && styles.dimmed, edge.ghost && styles.ghost]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <path d={curve.d} className={styles.edgePath} markerEnd={`url(#${markerId})`} />
                  <text
                    x={label.x}
                    y={label.y}
                    className={styles.edgeLabel}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {edge.label}
                    {edge.count > 1 && !edge.ghost && (
                      <tspan className={styles.edgeCount}> ×{edge.count}</tspan>
                    )}
                  </text>
                </g>
              );
            })}
          </g>

          <g>
            {measured.map((m) => {
              const box = boxFor(m.node.id);
              if (!box) return null;
              const dimmed = connected !== null && !connected.has(m.node.id);
              const className = [
                styles.node,
                m.node.variant === 'group' ? styles.nodeGroup : styles.nodeSingle,
                dimmed && styles.dimmed,
                m.node.ghost && styles.ghost,
                m.node.pinned && styles.pinned,
                onNodeClick && styles.clickable,
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <g
                  key={m.node.id}
                  className={className}
                  style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
                  onClick={() => {
                    if (movedRef.current) return;
                    onNodeClick?.(m.node);
                  }}
                  onMouseEnter={() => hoverNode(m.node)}
                  onMouseLeave={() => hoverNode(null)}
                >
                  {m.node.pinned && <circle r={m.radius + 3} className={styles.pinRing} />}
                  <circle r={m.radius} className={styles.shape} />
                  <text className={styles.nodeLabel} textAnchor="middle" dominantBaseline="central">
                    {m.node.ghost && m.node.count !== undefined ? 0 : m.node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {hovered && hoveredBox && (
        <div
          className={`${styles.card} ${
            view.y + hoveredBox.y * view.scale > size.height / 2 ? styles.cardAbove : ''
          }`}
          style={{
            left: view.x + hoveredBox.x * view.scale,
            top:
              view.y + hoveredBox.y * view.scale > size.height / 2
                ? view.y + (hoveredBox.y - hovered.radius - 6) * view.scale
                : view.y + (hoveredBox.y + hovered.radius + 6) * view.scale,
          }}
        >
          <div className={styles.cardTitle}>{hovered.node.title}</div>
          {hovered.node.detail && <div className={styles.cardDetail}>{hovered.node.detail}</div>}
        </div>
      )}
    </div>
  );
}
