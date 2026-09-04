import type { World } from '@koota/core';
import { useEffect, useState } from 'react';
import { readWorldMemory, type WorldMemory } from '../model/world-memory';

const POLL_MS = 500;

/** Memory changes with every spawn and query, so it is sampled on a timer. */
export function useWorldMemory(world: World): WorldMemory {
  const [memory, setMemory] = useState(() => readWorldMemory(world));

  useEffect(() => {
    const tick = () => setMemory(readWorldMemory(world));
    tick();
    const interval = setInterval(tick, POLL_MS);
    return () => clearInterval(interval);
  }, [world]);

  return memory;
}
