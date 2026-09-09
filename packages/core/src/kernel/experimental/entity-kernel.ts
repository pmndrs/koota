/** Experimental bounded identity and membership kernel. Not part of the public contract. */
type Integers = number[] | Uint32Array;
type Values = number[] | Float64Array;

export type EntityKernel = {
  capacity: number;
  edgeCapacity: number;
  stride: number;
  maxGeneration: number;
  size: number;
  cursor: number;
  free: number;
  edgeCursor: number;
  edgeFree: number;
  state: Integers;
  generation: Integers;
  nextFree: Integers;
  dense: Integers;
  sparse: Integers;
  subjectHead: Integers;
  traitHead: Integers;
  traitSize: Integers;
  pairRelation: Integers;
  pairTarget: Integers;
  relationHead: Integers;
  targetHead: Integers;
  relationNext: Integers;
  relationPrev: Integers;
  targetNext: Integers;
  targetPrev: Integers;
  pairTable: Integers;
  subjects: Integers;
  traits: Integers;
  subjectNext: Integers;
  subjectPrev: Integers;
  traitNext: Integers;
  traitPrev: Integers;
  values: Values;
  destroyQueue: Integers;
};

function integers(size: number, typed: boolean): Integers {
  if (typed) return new Uint32Array(size);
  const result: number[] = [];
  for (let i = 0; i < size; i++) result[i] = 0;
  return result;
}

function values(size: number, typed: boolean): Values {
  if (typed) return new Float64Array(size);
  const result = [0.5];
  for (let i = 0; i < size; i++) result[i] = 0;
  return result;
}

export function createEntityKernel(
  capacity: number,
  edgeCapacity: number,
  storage: 'packed' | 'typed' = 'typed'
): EntityKernel {
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 0xfffff)
    throw new RangeError('Entity capacity must be an integer from 0 to 1048575.');
  if (!Number.isInteger(edgeCapacity) || edgeCapacity < 0 || edgeCapacity > 0x3fffffff)
    throw new RangeError('Membership capacity must be a nonnegative Smi.');
  const size = capacity + 1;
  const stride = 2 ** Math.ceil(Math.log2(Math.max(2, size)));
  const typed = storage === 'typed';
  return {
    capacity,
    edgeCapacity,
    stride,
    maxGeneration: Math.floor(0x3fffffff / stride),
    size: 0,
    cursor: 0,
    free: 0,
    edgeCursor: 0,
    edgeFree: 0,
    state: integers(size, typed),
    generation: integers(size, typed),
    nextFree: integers(size, typed),
    dense: integers(size, typed),
    sparse: integers(size, typed),
    subjectHead: integers(size, typed),
    traitHead: integers(size, typed),
    traitSize: integers(size, typed),
    pairRelation: integers(size, typed),
    pairTarget: integers(size, typed),
    relationHead: integers(size, typed),
    targetHead: integers(size, typed),
    relationNext: integers(size, typed),
    relationPrev: integers(size, typed),
    targetNext: integers(size, typed),
    targetPrev: integers(size, typed),
    pairTable: integers(stride * 2, typed),
    subjects: integers(edgeCapacity + 1, typed),
    traits: integers(edgeCapacity + 1, typed),
    subjectNext: integers(edgeCapacity + 1, typed),
    subjectPrev: integers(edgeCapacity + 1, typed),
    traitNext: integers(edgeCapacity + 1, typed),
    traitPrev: integers(edgeCapacity + 1, typed),
    values: values(edgeCapacity + 1, typed),
    destroyQueue: integers(size, typed),
  };
}

/** Zero is the invalid/full sentinel. Slots retire instead of wrapping generations. */
export function spawn(kernel: EntityKernel): number {
  let slot = kernel.free;
  if (slot !== 0) kernel.free = kernel.nextFree[slot];
  else {
    if (kernel.cursor === kernel.capacity) return 0;
    slot = ++kernel.cursor;
  }
  kernel.state[slot] = 1;
  kernel.sparse[slot] = kernel.size;
  kernel.dense[kernel.size++] = slot;
  return kernel.generation[slot] * kernel.stride + slot;
}

export function alive(kernel: EntityKernel, entity: number): boolean {
  if (!Number.isInteger(entity) || entity <= 0 || entity > 0x3fffffff) return false;
  const slot = entity % kernel.stride;
  return (
    slot <= kernel.cursor &&
    kernel.state[slot] === 1 &&
    kernel.generation[slot] * kernel.stride + slot === entity
  );
}

function findEdge(kernel: EntityKernel, subject: number, trait: number): number {
  let edge = kernel.subjectHead[subject];
  while (edge !== 0) {
    if (kernel.traits[edge] === trait) return edge;
    edge = kernel.subjectNext[edge];
  }
  return 0;
}

/** 1 inserted, 0 already present, -1 full, -2 invalid identity. */
export function attach(kernel: EntityKernel, entity: number, trait: number): number {
  if (!alive(kernel, entity) || !alive(kernel, trait)) return -2;
  const subject = entity % kernel.stride;
  const predicate = trait % kernel.stride;
  if (findEdge(kernel, subject, trait) !== 0) return 0;
  let edge = kernel.edgeFree;
  if (edge !== 0) kernel.edgeFree = kernel.subjectNext[edge];
  else {
    if (kernel.edgeCursor === kernel.edgeCapacity) return -1;
    edge = ++kernel.edgeCursor;
  }
  const subjectHead = kernel.subjectHead[subject];
  const traitHead = kernel.traitHead[predicate];
  kernel.subjects[edge] = subject;
  kernel.traits[edge] = trait;
  kernel.values[edge] = 0;
  kernel.subjectPrev[edge] = 0;
  kernel.subjectNext[edge] = subjectHead;
  if (subjectHead !== 0) kernel.subjectPrev[subjectHead] = edge;
  kernel.subjectHead[subject] = edge;
  kernel.traitPrev[edge] = 0;
  kernel.traitNext[edge] = traitHead;
  if (traitHead !== 0) kernel.traitPrev[traitHead] = edge;
  kernel.traitHead[predicate] = edge;
  kernel.traitSize[predicate]++;
  return 1;
}

function removeEdge(kernel: EntityKernel, edge: number): void {
  const subject = kernel.subjects[edge];
  const trait = kernel.traits[edge] % kernel.stride;
  const sp = kernel.subjectPrev[edge];
  const sn = kernel.subjectNext[edge];
  const tp = kernel.traitPrev[edge];
  const tn = kernel.traitNext[edge];
  if (sp === 0) kernel.subjectHead[subject] = sn;
  else kernel.subjectNext[sp] = sn;
  if (sn !== 0) kernel.subjectPrev[sn] = sp;
  if (tp === 0) kernel.traitHead[trait] = tn;
  else kernel.traitNext[tp] = tn;
  if (tn !== 0) kernel.traitPrev[tn] = tp;
  kernel.traitSize[trait]--;
  kernel.subjectNext[edge] = kernel.edgeFree;
  kernel.edgeFree = edge;
}

export function detach(kernel: EntityKernel, entity: number, trait: number): boolean {
  if (!alive(kernel, entity) || !alive(kernel, trait)) return false;
  const edge = findEdge(kernel, entity % kernel.stride, trait);
  if (edge === 0) return false;
  removeEdge(kernel, edge);
  return true;
}

export function has(kernel: EntityKernel, entity: number, trait: number): boolean {
  return (
    alive(kernel, entity) &&
    alive(kernel, trait) &&
    findEdge(kernel, entity % kernel.stride, trait) !== 0
  );
}

/** Copy through caller storage to avoid boxing scalar values across function boundaries. */
export function readInto(
  kernel: EntityKernel,
  entity: number,
  trait: number,
  output: Values,
  offset = 0
): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset >= output.length) return false;
  if (!alive(kernel, entity) || !alive(kernel, trait)) return false;
  const edge = findEdge(kernel, entity % kernel.stride, trait);
  if (edge === 0) return false;
  output[offset] = kernel.values[edge];
  return true;
}

export function writeFrom(
  kernel: EntityKernel,
  entity: number,
  trait: number,
  input: Values,
  offset = 0
): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset >= input.length) return false;
  if (!alive(kernel, entity) || !alive(kernel, trait)) return false;
  const edge = findEdge(kernel, entity % kernel.stride, trait);
  if (edge === 0) return false;
  kernel.values[edge] = input[offset];
  return true;
}

function pairHash(relation: number, target: number, mask: number): number {
  return (Math.imul(relation, 0x9e3779b1) ^ Math.imul(target, 0x85ebca6b)) & mask;
}

/** Intern a pair in the same identity pool. Either endpoint may itself be a pair. */
export function pair(kernel: EntityKernel, relation: number, target: number): number {
  if (!alive(kernel, relation) || !alive(kernel, target)) return 0;
  const mask = kernel.pairTable.length - 1;
  let bucket = pairHash(relation, target, mask);
  let slot = kernel.pairTable[bucket];
  while (slot !== 0) {
    if (kernel.pairRelation[slot] === relation && kernel.pairTarget[slot] === target)
      return kernel.generation[slot] * kernel.stride + slot;
    bucket = (bucket + 1) & mask;
    slot = kernel.pairTable[bucket];
  }
  const entity = spawn(kernel);
  if (entity === 0) return 0;
  slot = entity % kernel.stride;
  kernel.pairTable[bucket] = slot;
  kernel.pairRelation[slot] = relation;
  kernel.pairTarget[slot] = target;
  const r = relation % kernel.stride;
  const t = target % kernel.stride;
  const rh = kernel.relationHead[r];
  const th = kernel.targetHead[t];
  kernel.relationPrev[slot] = 0;
  kernel.relationNext[slot] = rh;
  if (rh !== 0) kernel.relationPrev[rh] = slot;
  kernel.relationHead[r] = slot;
  kernel.targetPrev[slot] = 0;
  kernel.targetNext[slot] = th;
  if (th !== 0) kernel.targetPrev[th] = slot;
  kernel.targetHead[t] = slot;
  return entity;
}

function removePair(kernel: EntityKernel, slot: number): void {
  const relation = kernel.pairRelation[slot];
  const target = kernel.pairTarget[slot];
  const mask = kernel.pairTable.length - 1;
  let hole = pairHash(relation, target, mask);
  while (kernel.pairTable[hole] !== slot) hole = (hole + 1) & mask;
  // Shift entries whose probe path crosses the hole, avoiding tombstone accumulation.
  let bucket = (hole + 1) & mask;
  while (kernel.pairTable[bucket] !== 0) {
    const next = kernel.pairTable[bucket];
    const home = pairHash(kernel.pairRelation[next], kernel.pairTarget[next], mask);
    if (((bucket - home) & mask) >= ((bucket - hole) & mask)) {
      kernel.pairTable[hole] = next;
      hole = bucket;
    }
    bucket = (bucket + 1) & mask;
  }
  kernel.pairTable[hole] = 0;
  const rp = kernel.relationPrev[slot];
  const rn = kernel.relationNext[slot];
  const tp = kernel.targetPrev[slot];
  const tn = kernel.targetNext[slot];
  if (rp === 0) kernel.relationHead[relation % kernel.stride] = rn;
  else kernel.relationNext[rp] = rn;
  if (rn !== 0) kernel.relationPrev[rn] = rp;
  if (tp === 0) kernel.targetHead[target % kernel.stride] = tn;
  else kernel.targetNext[tp] = tn;
  if (tn !== 0) kernel.targetPrev[tn] = tp;
  kernel.pairRelation[slot] = 0;
  kernel.pairTarget[slot] = 0;
}

/** Delete memberships and dependent pairs, but keep their subjects alive. */
export function destroy(kernel: EntityKernel, entity: number): boolean {
  if (!alive(kernel, entity)) return false;
  const first = entity % kernel.stride;
  const queue = kernel.destroyQueue;
  queue[0] = first;
  kernel.state[first] = 2;
  let count = 1;
  // Pending state deduplicates the bounded queue, including pairs with equal endpoints.
  for (let i = 0; i < count; i++) {
    const slot = queue[i];
    let child = kernel.relationHead[slot];
    while (child !== 0) {
      if (kernel.state[child] === 1) {
        kernel.state[child] = 2;
        queue[count++] = child;
      }
      child = kernel.relationNext[child];
    }
    child = kernel.targetHead[slot];
    while (child !== 0) {
      if (kernel.state[child] === 1) {
        kernel.state[child] = 2;
        queue[count++] = child;
      }
      child = kernel.targetNext[child];
    }
  }
  for (let i = count - 1; i >= 0; i--) {
    const slot = queue[i];
    while (kernel.subjectHead[slot] !== 0) removeEdge(kernel, kernel.subjectHead[slot]);
    while (kernel.traitHead[slot] !== 0) removeEdge(kernel, kernel.traitHead[slot]);
    if (kernel.pairRelation[slot] !== 0) removePair(kernel, slot);
    const last = kernel.dense[--kernel.size];
    kernel.dense[kernel.sparse[slot]] = last;
    kernel.sparse[last] = kernel.sparse[slot];
    kernel.state[slot] = 0;
    if (kernel.generation[slot] < kernel.maxGeneration) {
      kernel.generation[slot]++;
      kernel.nextFree[slot] = kernel.free;
      kernel.free = slot;
    }
  }
  return true;
}

/** Return the required count, writing only the caller's capacity. Empty terms match all. */
export function collect(kernel: EntityKernel, required: readonly number[], output: Integers): number {
  const termCount = required.length;
  const outputCapacity = output.length;
  const stride = kernel.stride;
  if (termCount === 0) {
    const count = kernel.size;
    const end = Math.min(count, outputCapacity);
    for (let i = 0; i < end; i++) {
      const slot = kernel.dense[i];
      output[i] = kernel.generation[slot] * stride + slot;
    }
    return count;
  }
  let smallest = 0;
  let smallestTerm = 0;
  let minimum = kernel.size + 1;
  for (let i = 0; i < termCount; i++) {
    const term = required[i];
    if (!alive(kernel, term)) return 0;
    const slot = term % stride;
    if (kernel.traitSize[slot] < minimum) {
      smallest = slot;
      smallestTerm = term;
      minimum = kernel.traitSize[slot];
    }
  }
  let count = 0;
  let edge = kernel.traitHead[smallest];
  while (edge !== 0) {
    const subject = kernel.subjects[edge];
    let matches = true;
    for (let i = 0; i < termCount; i++) {
      const term = required[i];
      if (term !== smallestTerm && findEdge(kernel, subject, term) === 0) {
        matches = false;
        break;
      }
    }
    if (matches) {
      if (count < outputCapacity) output[count] = kernel.generation[subject] * stride + subject;
      count++;
    }
    edge = kernel.traitNext[edge];
  }
  return count;
}
