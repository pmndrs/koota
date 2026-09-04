/**
 * How often a live view of the world refreshes. World events arrive per entity and per
 * trait, thousands of times a frame in a busy app, so every subscription in the devtools
 * collapses them into at most one read and one render per interval.
 */
export const REFRESH_MS = 100;

export interface Throttle {
  /** Asks for a run. The first call in an interval starts the timer, later ones are free. */
  schedule: () => void;
  /** Drops a pending run. */
  cancel: () => void;
}

/** Runs `fn` on the trailing edge of a burst, at most once per interval. */
export function createThrottle(fn: () => void, ms = REFRESH_MS): Throttle {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule() {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, ms);
    },
    cancel() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    },
  };
}
