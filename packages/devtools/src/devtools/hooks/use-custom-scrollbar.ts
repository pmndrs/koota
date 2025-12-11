import { useCallback, useLayoutEffect, useRef, useState } from 'react';

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

interface ScrollbarMetrics {
	isScrollable: boolean;
	thumbHeight: number;
	thumbTop: number;
}

/**
 * Minimal custom scrollbar for a scroll viewport.
 *
 * - Tracks thumb size/position based on scroll state
 * - Supports dragging the thumb (pointer events)
 * - Provides a content ref so we can observe content size changes
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

	const [metrics, setMetrics] = useState<ScrollbarMetrics>(() => ({
		isScrollable: false,
		thumbHeight: 0,
		thumbTop: 0,
	}));

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
				// Keep visible while hovering or dragging
				if (isHoveringRef.current) return;
				if (dragRef.current) return;
				setIsVisible(false);
			}, delayMs);
		},
		[clearHideTimeout]
	);

	const update = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;

		const { scrollTop, scrollHeight, clientHeight } = el;
		const scrollable = scrollHeight - clientHeight;

		// Not scrollable
		if (scrollable <= 0 || clientHeight <= 0) {
			setMetrics((prev) =>
				prev.isScrollable ? { isScrollable: false, thumbHeight: 0, thumbTop: 0 } : prev
			);
			setIsVisible(false);
			return;
		}

		const minThumb = 18;
		const thumbHeight = clamp(
			(clientHeight * clientHeight) / scrollHeight,
			minThumb,
			clientHeight
		);
		const track = clientHeight - thumbHeight;
		const thumbTop = track <= 0 ? 0 : (scrollTop / scrollable) * track;

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

			const { scrollHeight, clientHeight } = el;
			const scrollable = scrollHeight - clientHeight;
			if (scrollable <= 0) return;

			const minThumb = 18;
			const thumbHeight = clamp(
				(clientHeight * clientHeight) / scrollHeight,
				minThumb,
				clientHeight
			);
			const track = clientHeight - thumbHeight;
			if (track <= 0) return;

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

	const onThumbPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== e.pointerId) return;
		dragRef.current = null;
		hideSoon();
	}, []);

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

		let ro: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined') {
			ro = new ResizeObserver(() => update());
			ro.observe(el);
			if (contentRef.current) ro.observe(contentRef.current);
		}

		return () => {
			el.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
			if (ro) ro.disconnect();
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
		rootProps: {
			onMouseEnter,
			onMouseLeave,
		} as const,
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
