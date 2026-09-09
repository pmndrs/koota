/** Bounded tag-only graph used to measure query storage and structural movement. */
export function createArchetypeGraph(capacity: number, traitCount: number) {
  if (
    !Number.isInteger(capacity) ||
    capacity < 0 ||
    !Number.isInteger(traitCount) ||
    traitCount < 0 ||
    traitCount > 12
  )
    throw new RangeError('Invalid graph capacity.');
  const archetypes = 2 ** traitCount;
  const pages = Math.ceil(capacity / 256) + archetypes + 1;
  const graph = {
    capacity,
    size: 0,
    freePage: 1,
    masks: new Uint32Array(capacity),
    locations: new Uint32Array(capacity),
    values: new Uint32Array(pages * 256),
    next: new Uint32Array(pages),
    previous: new Uint32Array(pages),
    counts: new Uint32Array(archetypes),
    heads: new Uint32Array(archetypes),
    tails: new Uint32Array(archetypes),
    transitions: new Uint32Array(archetypes * traitCount),
    traitCount,
  };
  for (let i = 1; i < pages - 1; i++) graph.next[i] = i + 1;
  for (let mask = 0; mask < archetypes; mask++)
    for (let bit = 0; bit < traitCount; bit++)
      graph.transitions[mask * traitCount + bit] = mask ^ (1 << bit);
  return graph;
}

type Graph = ReturnType<typeof createArchetypeGraph>;

function append(graph: Graph, entity: number, mask: number): void {
  const count = graph.counts[mask];
  let page = graph.tails[mask];
  if ((count & 255) === 0) {
    const fresh = graph.freePage;
    graph.freePage = graph.next[fresh];
    graph.next[fresh] = 0;
    graph.previous[fresh] = page;
    if (page) graph.next[page] = fresh;
    else graph.heads[mask] = fresh;
    graph.tails[mask] = page = fresh;
  }
  const location = page * 256 + (count & 255);
  graph.locations[entity] = location;
  graph.values[location] = entity;
  graph.masks[entity] = mask;
  graph.counts[mask] = count + 1;
}

export function spawn(graph: Graph, mask: number): number {
  if (graph.size === graph.capacity) return -1;
  const entity = graph.size++;
  append(graph, entity, mask);
  return entity;
}

export function toggle(graph: Graph, entity: number, bit: number): void {
  const mask = graph.masks[entity];
  const destination = graph.transitions[mask * graph.traitCount + bit];
  const remaining = --graph.counts[mask];
  const tail = graph.tails[mask];
  const last = graph.values[tail * 256 + (remaining & 255)];
  const location = graph.locations[entity];
  graph.values[location] = last;
  graph.locations[last] = location;
  if ((remaining & 255) === 0) {
    const previous = graph.previous[tail];
    if (previous) graph.next[previous] = 0;
    else graph.heads[mask] = 0;
    graph.tails[mask] = previous;
    graph.next[tail] = graph.freePage;
    graph.freePage = tail;
  }
  append(graph, entity, destination);
}

export function compile(graph: Graph, required: number, forbidden = 0): Uint32Array {
  const masks: number[] = [];
  for (let mask = 0; mask < graph.counts.length; mask++)
    if ((mask & required) === required && (mask & forbidden) === 0) masks.push(mask);
  return Uint32Array.from(masks);
}

export function collect(graph: Graph, masks: Uint32Array, output: Uint32Array): number {
  let total = 0;
  for (let i = 0; i < masks.length; i++) {
    const mask = masks[i];
    let remaining = graph.counts[mask];
    let page = graph.heads[mask];
    while (remaining) {
      const count = Math.min(256, remaining);
      const offset = page * 256;
      for (let j = 0; j < count; j++) {
        if (total < output.length) output[total] = graph.values[offset + j];
        total++;
      }
      remaining -= count;
      page = graph.next[page];
    }
  }
  return total;
}
