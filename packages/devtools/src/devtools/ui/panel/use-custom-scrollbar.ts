import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const MIN_THUMB = 18;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

interface ScrollbarMetrics {
  isScrollable: boolean;
  thumbHeight: number;
  thumbTop: number;
}

function measure(el: HTMLElement) {
  const { scrollTop, scrollHeight, clientHeight } = el;
  const scrollable = scrollHeight - clientHeight;
  const thumbHeight = clamp((clientHeight * clientHeight) / scrollHeight, MIN_THUMB, clientHeight);
  const track = clientHeight - thumbHeight;
  const thumbTop = track <= 0 ? 0 : (scrollTop / scrollable) * track;
  return { scrollable, thumbHeight, track, thumbTop, clientHeight };
}

/**
 * An overlay scrollbar for a scroll viewport whose native bar is hidden. The
 * thumb tracks scroll position, can be dragged, and fades out when idle.
 */
export function useCustomScrollbar(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);
  const isHoveringRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startClientY: number;
    startScrollTop: number;
    scrollable: number;
    track: number;
  } | null>(null);

  const [metrics, setMetrics] = useState<ScrollbarMetrics>({
    isScrollable: false,
    thumbHeight: 0,
    thumbTop: 0,
  });
  const [isVisible, setIsVisible] = useState(false);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current != null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearHideTimeout();
    setIsVisible(true);
  }, [clearHideTimeout]);

  const hideSoon = useCallback(
    (delayMs = 650) => {
      clearHideTimeout();
      hideTimeoutRef.current = window.setTimeout(() => {
        if (isHoveringRef.current || dragRef.current) return;
        setIsVisible(false);
      }, delayMs);
    },
    [clearHideTimeout]
  );

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollable, thumbHeight, thumbTop, clientHeight } = measure(el);

    if (scrollable <= 0 || clientHeight <= 0) {
      setMetrics((prev) =>
        prev.isScrollable ? { isScrollable: false, thumbHeight: 0, thumbTop: 0 } : prev
      );
      setIsVisible(false);
      return;
    }

    setMetrics({ isScrollable: true, thumbHeight, thumbTop });
  }, [scrollRef]);

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      update();
    });
  }, [update]);

  const onThumbPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;

      const { scrollable, track } = measure(el);
      if (scrollable <= 0 || track <= 0) return;

      dragRef.current = {
        pointerId: e.pointerId,
        startClientY: e.clientY,
        startScrollTop: el.scrollTop,
        scrollable,
        track,
      };

      show();
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [scrollRef, show]
  );

  const onThumbPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      const drag = dragRef.current;
      if (!el || !drag || drag.pointerId !== e.pointerId) return;

      const deltaY = e.clientY - drag.startClientY;
      const nextScrollTop = drag.startScrollTop + (deltaY * drag.scrollable) / drag.track;
      el.scrollTop = clamp(nextScrollTop, 0, drag.scrollable);
      scheduleUpdate();
    },
    [scrollRef, scheduleUpdate]
  );

  const onThumbPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      hideSoon();
    },
    [hideSoon]
  );

  const onMouseEnter = useCallback(() => {
    isHoveringRef.current = true;
    show();
  }, [show]);

  const onMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    hideSoon(250);
  }, [hideSoon]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    update();

    const onScroll = () => {
      show();
      scheduleUpdate();
      hideSoon();
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    const onResize = () => update();
    window.addEventListener('resize', onResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => update());
      observer.observe(el);
      if (contentRef.current) observer.observe(contentRef.current);
    }

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      dragRef.current = null;
      clearHideTimeout();
    };
  }, [clearHideTimeout, hideSoon, scrollRef, scheduleUpdate, show, update]);

  return {
    contentRef,
    isScrollable: metrics.isScrollable,
    isScrollbarVisible: metrics.isScrollable && isVisible,
    rootProps: { onMouseEnter, onMouseLeave } as const,
    thumbStyle: {
      height: `${metrics.thumbHeight}px`,
      transform: `translateY(${metrics.thumbTop}px)`,
    } as const,
    thumbProps: {
      onPointerDown: onThumbPointerDown,
      onPointerMove: onThumbPointerMove,
      onPointerUp: onThumbPointerUp,
    } as const,
  };
}
