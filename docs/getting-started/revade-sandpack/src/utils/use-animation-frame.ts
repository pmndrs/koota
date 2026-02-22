import { useEffect, useRef } from 'react';

export function useAnimationFrame(callback: (delta: number) => void) {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        let rafId: number;
        let last = performance.now();

        const loop = (now: number) => {
            const delta = (now - last) / 1000;
            last = now;
            callbackRef.current?.(delta);
            rafId = requestAnimationFrame(loop);
        };

        rafId = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(rafId);
    }, []);
}
