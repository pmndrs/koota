import { createWorld, trait } from 'koota';

/**
 * Walks two throwaway queries, as an app has by the time any one of its walks is hot. A process
 * that has only walked one query never shows V8 a second compiled walk, so V8 inlines that walk
 * into `each`, where the try block around it keeps checks and loads inside the loop. No app with
 * more than one walked query runs that shape. Call this first in a bench that measures `each`.
 */
export function warmWalks() {
  const A = trait({ value: 0 });
  const B = trait({ value: 0 });
  const world = createWorld();
  for (let i = 0; i < 8; i++) world.spawn(A, B);
  // V8 starts recording what a call site sees once the function has run about eight times. Five
  // repeats was the fewest that always worked, so this runs three times that.
  for (let i = 0; i < 16; i++) {
    world.query(A, B).each((a, b) => {
      a.value += b.value;
    });
    world.query(B, A).each((b, a) => {
      b.value += a.value;
    });
  }
  world.destroy();
}
