import { setTimeout as delay } from 'node:timers/promises';

export function hasNativeGc(): boolean {
    return typeof globalThis.gc === 'function';
}

function gc(): void {
    const gcFn = globalThis.gc;
    if (typeof gcFn !== 'function') {
        throw new Error('Native gc() is unavailable. Run tests with NODE_OPTIONS=--expose-gc.');
    }

    gcFn();
}

export async function waitForFinalization(
    register: (registry: FinalizationRegistry<string>) => void,
    attempts = 200
): Promise<boolean> {
    let finalized = false;
    const registry = new FinalizationRegistry<string>(() => {
        finalized = true;
    });

    register(registry);

    for (let i = 0; i < attempts; i++) {
        gc();
        await Promise.resolve();
        await delay(0);

        if (finalized) return true;
    }

    return false;
}
