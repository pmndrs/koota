type StrictMode = 'off' | 'dev' | 'always';
let strictMode: StrictMode = 'off';

export function setStrictMode(mode: StrictMode | boolean): void {
    if (mode === true) strictMode = 'always';
    else if (mode === false) strictMode = 'off';
    else strictMode = mode;
}

/**
 * Assert a condition in strict mode. When mode is 'dev', the
 * process.env.NODE_ENV check allows bundlers to eliminate this
 * code path in production builds via dead code elimination (DCE).
 * The @inline directive ensures the function body is inlined at
 * call sites, making the NODE_ENV check statically analyzable.
 */
export /* @inline */ function strictAssert(condition: boolean, message: string): asserts condition {
    if (strictMode === 'off') return;
    if (strictMode === 'dev' && process.env.NODE_ENV === 'production') return;
    if (!condition) {
        throw new Error(`[Koota] ${message}`);
    }
}
