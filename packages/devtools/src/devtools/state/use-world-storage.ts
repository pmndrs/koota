import type { World } from '@koota/core';
import { useEffect, useState } from 'react';
import { readWorldStorage, type WorldStorage } from '../model/world-storage';

const POLL_MS = 500;

/** Storage changes with every spawn and query, so it is sampled on a timer. */
export function useWorldStorage(world: World): WorldStorage {
  const [storage, setStorage] = useState(() => readWorldStorage(world));

  useEffect(() => {
    const tick = () => setStorage(readWorldStorage(world));
    tick();
    const interval = setInterval(tick, POLL_MS);
    return () => clearInterval(interval);
  }, [world]);

  return storage;
}
