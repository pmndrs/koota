export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/**
 * Frame-rate independent damped lerp
 * @param current - Current value
 * @param target - Target value
 * @param damping - Damping factor at 60fps (0-1, higher = faster convergence)
 * @param delta - Time delta in seconds
 */
export function dampedLerp(current: number, target: number, damping: number, delta: number): number {
	const alpha = 1 - Math.pow(1 - damping, delta * 60);
	return current + (target - current) * alpha;
}

