import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

/**
 * Zoom and pan for an SVG viewport. The wheel zooms around the cursor and
 * dragging with the left button pans. Wheel events are handled natively so
 * the page never zooms or scrolls underneath.
 */
export function useGraphViewport(svgRef: RefObject<SVGSVGElement | null>) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, translateX: 0, translateY: 0 });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = svg.getBoundingClientRect();
      const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const nextScale = Math.min(Math.max(scale * (e.deltaY > 0 ? 0.9 : 1.1), MIN_ZOOM), MAX_ZOOM);
      const change = nextScale / scale;

      setScale(nextScale);
      setTranslate({
        x: mouse.x - (mouse.x - translate.x) * change,
        y: mouse.y - (mouse.y - translate.y) * change,
      });
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [svgRef, scale, translate]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        translateX: translate.x,
        translateY: translate.y,
      };
    },
    [translate]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDragging) return;
      setTranslate({
        x: dragStart.current.translateX + (e.clientX - dragStart.current.x),
        y: dragStart.current.translateY + (e.clientY - dragStart.current.y),
      });
    },
    [isDragging]
  );

  const onMouseUp = useCallback(() => setIsDragging(false), []);

  const reset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  return {
    transform: `translate(${translate.x}, ${translate.y}) scale(${scale})`,
    isDragging,
    handlers: { onMouseDown, onMouseMove, onMouseUp, onMouseLeave: onMouseUp },
    reset,
  };
}
