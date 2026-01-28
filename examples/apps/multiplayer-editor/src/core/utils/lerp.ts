export function lerp(current: number, target: number, factor: number, snapThreshold: number): number {
    const diff = target - current;
    if (Math.abs(diff) < snapThreshold) {
        return target;
    }
    return current + diff * factor;
}

// Angle lerp that takes the shortest path around the circle (in degrees)
export function angleLerp(
    current: number,
    target: number,
    factor: number,
    snapThreshold: number
): number {
    // Normalize difference to [-180, 180]
    let diff = ((target - current + 180) % 360) - 180;
    if (diff < -180) diff += 360;

    if (Math.abs(diff) < snapThreshold) {
        return target;
    }
    return current + diff * factor;
}
