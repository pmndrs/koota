export type Archetype = {
  readonly id: number;
  readonly key: string;
  readonly traitIds: readonly number[];
  readonly add: Map<number, Archetype>;
  readonly remove: Map<number, Archetype>;
};

/** Canonical trait sets connected by cached single-trait transitions. */
export function createArchetypeGraph() {
  const root: Archetype = {
    id: 0,
    key: '',
    traitIds: [],
    add: new Map(),
    remove: new Map(),
  };
  const nodes = new Map<string, Archetype>([['', root]]);

  function intern(traitIds: number[]): Archetype {
    const key = traitIds.join(',');
    let node = nodes.get(key);
    if (node === undefined) {
      node = { id: nodes.size, key, traitIds, add: new Map(), remove: new Map() };
      nodes.set(key, node);
    }
    return node;
  }

  function add(node: Archetype, traitId: number): Archetype {
    const cached = node.add.get(traitId);
    if (cached !== undefined) return cached;

    let index = 0;
    while (index < node.traitIds.length && node.traitIds[index] < traitId) index++;
    if (node.traitIds[index] === traitId) {
      node.add.set(traitId, node);
      return node;
    }

    const traitIds = node.traitIds.slice();
    traitIds.splice(index, 0, traitId);
    const next = intern(traitIds);
    node.add.set(traitId, next);
    next.remove.set(traitId, node);
    return next;
  }

  function remove(node: Archetype, traitId: number): Archetype {
    const cached = node.remove.get(traitId);
    if (cached !== undefined) return cached;

    const index = node.traitIds.indexOf(traitId);
    if (index === -1) {
      node.remove.set(traitId, node);
      return node;
    }

    const traitIds = node.traitIds.slice();
    traitIds.splice(index, 1);
    const next = intern(traitIds);
    node.remove.set(traitId, next);
    next.add.set(traitId, node);
    return next;
  }

  return { root, add, remove };
}
