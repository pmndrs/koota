import type { Entity, MutableOrderedView } from '@koota/core';

const snapshots = new WeakMap<MutableOrderedView, readonly Entity[]>();

/**
 * A frozen copy of an ordered view's entities. The same array comes back until the members or
 * their order change, so a render can compare snapshots by identity.
 */
export function getOrderedSnapshot(
  view: MutableOrderedView | undefined
): readonly Entity[] | undefined {
  if (!view) return undefined;
  const previous = snapshots.get(view);
  if (previous !== undefined && hasSameOrder(view, previous)) return previous;
  const snapshot = Object.freeze(view.toArray());
  snapshots.set(view, snapshot);
  return snapshot;
}

function hasSameOrder(view: MutableOrderedView, previous: readonly Entity[]) {
  if (view.length !== previous.length) return false;
  for (let i = 0; i < previous.length; i++) {
    if (view.at(i) !== previous[i]) return false;
  }
  return true;
}
