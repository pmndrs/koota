export function formatTime(ns: number): string {
    if (ns >= 1_000_000_000) return `${(ns / 1_000_000_000).toFixed(2)}s`;
    if (ns >= 1_000_000) return `${(ns / 1_000_000).toFixed(2)}ms`;
    if (ns >= 1_000) return `${(ns / 1_000).toFixed(2)}µs`;
    return `${ns.toFixed(2)}ns`;
}

export function formatDelta(delta: number): string {
    const pct = delta * 100;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
}

export function formatP(p: number): string {
    if (p < 0.001) return '<.001';
    return p.toFixed(3).replace(/^0/, '');
}

export function visibleLength(s: string): number {
    return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}
