export function lerp(current: number, target: number, factor: number, snapThreshold: number): number {
    const diff = target - current;
    if (Math.abs(diff) < snapThreshold) {
        return target;
    }
    return current + diff * factor;
}
