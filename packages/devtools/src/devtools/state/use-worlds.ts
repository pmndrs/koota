import type { World } from '@koota/core';
import { universe } from '@koota/core';
import { useEffect, useState } from 'react';

const POLL_MS = 500;

/** Every world the universe knows about. A world registers itself on first use. */
function readWorlds(): World[] {
  const worlds: World[] = [];
  for (const ctx of universe.worlds) if (ctx) worlds.push(ctx.world);
  return worlds;
}

function sameWorlds(a: World[], b: World[]): boolean {
  return a.length === b.length && a.every((world, i) => world === b[i]);
}

/**
 * The live list of worlds. The universe has no subscriptions, so this polls it and only
 * hands out a new array when the set of worlds actually changed.
 */
export function useWorlds(): World[] {
  const [worlds, setWorlds] = useState(readWorlds);

  useEffect(() => {
    const tick = () => {
      const next = readWorlds();
      setWorlds((prev) => (sameWorlds(prev, next) ? prev : next));
    };
    tick();
    const interval = setInterval(tick, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  return worlds;
}
