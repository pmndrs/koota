import { useEffect, useEffectEvent } from 'react';

type Callback = (dt: number) => void;

export function useAnimationFrame(callback: Callback) {
	const onFrame = useEffectEvent((dt: number) => callback(dt));

	useEffect(() => {
		let lastTime = performance.now();
		let requestId = 0;

		const handleFrame = (time: number) => {
			// Calculate the change in time since the last frame
			const dt = (time - lastTime) / 1000;
			lastTime = time;
			// Call the callback with the delta time
			onFrame(dt);
			// Request the next frame
			requestId = requestAnimationFrame(handleFrame);
		};

		requestId = requestAnimationFrame(handleFrame);

		return () => {
			cancelAnimationFrame(requestId);
		};
	}, []);
}
