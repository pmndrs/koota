import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThrottle } from '../src/devtools/state/throttle';

describe('throttle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses a burst into one trailing run', () => {
    const fn = vi.fn();
    const throttle = createThrottle(fn, 100);

    for (let i = 0; i < 1000; i++) throttle.schedule();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    throttle.schedule();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('drops a pending run when cancelled', () => {
    const fn = vi.fn();
    const throttle = createThrottle(fn, 100);

    throttle.schedule();
    throttle.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});
