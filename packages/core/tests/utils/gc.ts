function getNativeGc(): (() => void) | undefined {
  const gcFn: unknown = Reflect.get(globalThis, 'gc');
  return typeof gcFn === 'function' ? (gcFn as () => void) : undefined;
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function hasNativeGc(): boolean {
  return getNativeGc() !== undefined;
}

function gc(): void {
  const gcFn = getNativeGc();
  if (!gcFn) {
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
    await delay();

    if (finalized) return true;
  }

  return false;
}
