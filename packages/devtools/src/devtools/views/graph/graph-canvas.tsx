import type { Entity } from '@koota/core';
import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import styles from './graph-canvas.module.css';
import {
  layoutGraph,
  layoutSignature,
  type LayoutEdgeInput,
  type LayoutNodeInput,
  type LayoutResult,
  type NodeBox,
} from './graph-layout';

export type CanvasNodeVariant = 'group' | 'aggregate' | 'entity' | 'focus';

export interface CanvasNode {
  id: string;
  variant: CanvasNodeVariant;
  label: string;
  /** Rendered as a pill on box nodes. */
  count?: number;
  /** Tooltip. */
  title?: string;
  /** Hovering the node highlights this entity in the world. */
  entity?: Entity;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  count: number;
}

interface GraphCanvasProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** Bump to re-fit the viewport, e.g. from a toolbar button. */
  fitSignal?: number;
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

const CHAR_W = 5.6; // glyph width of the 9px monospace label font
const LABEL_CHAR_W = 4.4; // glyph width of the 7.5px edge label font
const BOX_H = 22;
const BOX_PAD = 8;
const PILL_PAD = 5;
const ENTITY_R = 12;
const FOCUS_R = 15;
const MAX_LABEL = 22;
const TWEEN_MS = 320;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const FIT_PAD = 14;
const DRAG_THRESHOLD = 3;

interface MeasuredNode {
  node: CanvasNode;
  width: number;
  height: number;
  label: string;
  pillWidth: number;
}

function isCircle(variant: CanvasNodeVariant): boolean {
  return variant === 'entity' || variant === 'focus';
}

function truncate(text: string): string {
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
}

function measure(node: CanvasNode): MeasuredNode {
  if (isCircle(node.variant)) {
    const r = node.variant === 'focus' ? FOCUS_R : ENTITY_R;
    return { node, width: r * 2, height: r * 2, label: node.label, pillWidth: 0 };
  }
  const label = truncate(node.label);
  const pillWidth = node.count !== undefined ? String(node.count).length * CHAR_W + PILL_PAD * 2 : 0;
  const width = BOX_PAD + label.length * CHAR_W + (pillWidth ? 6 + pillWidth : 0) + BOX_PAD;
  return { node, width, height: BOX_H, label, pillWidth };
}

function edgeText(edge: CanvasEdge): string {
  return edge.count > 1 ? `${edge.label} ×${edge.count}` : edge.label;
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

interface EdgeGeometry {
  d: string;
  labelX: number;
  labelY: number;
}

function edgeGeometry(s: NodeBox, t: NodeBox, offset: number, selfLoop: boolean): EdgeGeometry {
  if (selfLoop) {
    const top = s.y - s.height / 2;
    const rise = 26 + Math.abs(offset) * 2;
    const x0 = s.x + s.width / 4;
    const x1 = s.x - s.width / 4;
    return {
      d: `M ${x0} ${top} C ${x0 + 10} ${top - rise}, ${x1 - 10} ${top - rise}, ${x1} ${top}`,
      labelX: s.x,
      labelY: top - rise * 0.75 - 2,
    };
  }

  const forward = t.x >= s.x;
  const sx = forward ? s.x + s.width / 2 : s.x - s.width / 2;
  const ex = forward ? t.x - t.width / 2 : t.x + t.width / 2;
  const sy = s.y + offset * 0.4;
  const ey = t.y + offset * 0.4;
  const reach = Math.max(Math.abs(ex - sx) * 0.5, 24);
  const c1x = forward ? sx + reach : sx - reach;
  const c2x = forward ? ex - reach : ex + reach;
  const c1y = sy + offset;
  const c2y = ey + offset;

  // Midpoint of the cubic at t = 0.5, lifted so the text sits just above the line.
  const labelX = (sx + 3 * c1x + 3 * c2x + ex) / 8;
  const labelY = (sy + 3 * c1y + 3 * c2y + ey) / 8 - 4;

  return { d: `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`, labelX, labelY };
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
 * Pannable, zoomable SVG that lays nodes out left to right. Layout only re-runs when the
 * structure changes, and every change slides nodes to their new place instead of jumping.
 */
export function GraphCanvas({
  nodes,
  edges,
  fitSignal = 0,
  onNodeClick,
  onNodeHover,
  children,
}: GraphCanvasProps) {
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
    () => measured.map((m) => ({ id: m.node.id, width: m.width, height: m.height })),
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

  // Hover dims everything that does not touch the hovered node.
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

  if (isEmpty) {
    return (
      <div ref={wrapperRef} className={styles.wrapper}>
        {children}
      </div>
    );
  }

  const boxFor = (id: string) => shownLayout.positions.get(id) ?? layout.positions.get(id);
  const variantClass: Record<CanvasNodeVariant, string> = {
    group: styles.nodeGroup,
    aggregate: styles.nodeAggregate,
    entity: styles.nodeEntity,
    focus: styles.nodeFocus,
  };

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
              const geo = edgeGeometry(s, t, offsets.get(edge.id) ?? 0, edge.source === edge.target);
              const dimmed =
                connected !== null && edge.source !== hoveredId && edge.target !== hoveredId;
              return (
                <g key={edge.id} className={`${styles.edge} ${dimmed ? styles.dimmed : ''}`}>
                  <path d={geo.d} className={styles.edgePath} markerEnd={`url(#${markerId})`} />
                  <text
                    x={geo.labelX}
                    y={geo.labelY}
                    className={styles.edgeLabel}
                    textAnchor="middle"
                  >
                    {edge.label}
                    {edge.count > 1 && <tspan className={styles.edgeCount}> ×{edge.count}</tspan>}
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
                variantClass[m.node.variant],
                dimmed && styles.dimmed,
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
                  {m.node.title && <title>{m.node.title}</title>}
                  {isCircle(m.node.variant) ? (
                    <>
                      {m.node.variant === 'focus' && (
                        <circle r={m.width / 2 + 4} className={styles.focusRing} />
                      )}
                      <circle r={m.width / 2} className={styles.shape} />
                      <text
                        className={styles.nodeLabel}
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {m.label}
                      </text>
                    </>
                  ) : (
                    <>
                      <rect
                        x={-m.width / 2}
                        y={-m.height / 2}
                        width={m.width}
                        height={m.height}
                        rx={5}
                        className={styles.shape}
                      />
                      <text
                        x={-m.width / 2 + BOX_PAD}
                        className={styles.nodeLabel}
                        dominantBaseline="central"
                      >
                        {m.label}
                      </text>
                      {m.pillWidth > 0 && (
                        <>
                          <rect
                            x={m.width / 2 - BOX_PAD - m.pillWidth}
                            y={-7}
                            width={m.pillWidth}
                            height={14}
                            rx={7}
                            className={styles.pill}
                          />
                          <text
                            x={m.width / 2 - BOX_PAD - m.pillWidth / 2}
                            className={styles.pillLabel}
                            textAnchor="middle"
                            dominantBaseline="central"
                          >
                            {m.node.count}
                          </text>
                        </>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
