const DEG2RAD = Math.PI / 180;

/**
 * Computes the X offset on a “fan arc” for a card at index `i`.
 *
 * We model the hand as points along a circle arc:
 * - each card index maps to an angle: \((i - centerIndex) * angleStepDeg\)
 * - the X component is \(sin(angle) * radius\)
 *
 * Used by `update-card-order` to select which slot a dragged card should snap to.
 */
export function arcXForIndex(
	i: number,
	centerIndex: number,
	angleStepDeg: number,
	radius: number
): number {
	const angleRad = (i - centerIndex) * angleStepDeg * DEG2RAD;
	return Math.sin(angleRad) * radius;
}


