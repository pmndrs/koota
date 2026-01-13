import { useEffect, useRef } from 'react';

export function useAnimationFrame(callback: () => void) {
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	useEffect(() => {
		let rafId: number;

		const loop = () => {
			callbackRef.current?.();
			rafId = requestAnimationFrame(loop);
		};

		rafId = requestAnimationFrame(loop);

		return () => cancelAnimationFrame(rafId);
	}, []);
}
