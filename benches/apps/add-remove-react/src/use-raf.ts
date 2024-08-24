import { useEffect, useRef } from 'react';

export function useRaf(callback: () => void | Promise<void>, deps: readonly unknown[] = []) {
	const rafRef = useRef<number>(0);

	useEffect(() => {
		const loop = async () => {
			await callback();
			rafRef.current = requestAnimationFrame(loop);
		};
		loop();

		return () => {
			cancelAnimationFrame(rafRef.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [callback, ...deps]);
}
