import { getEntityId, MAX_PAGES } from './pack-entity';
import type { Entity } from './types';

/** Intrusive edges keep both directions without allocating a container per entity. */
export function createMembershipIndex(capacity = 256) {
  const pages: (Int32Array | undefined)[] = [];
  for (let i = 0; i < MAX_PAGES; i++) pages[i] = undefined;
  return {
    capacity,
    table: new Int32Array(2 ** Math.ceil(Math.log2(Math.max(2, capacity * 2)))),
    count: 0,
    version: 0,
    cursor: 1,
    free: 0,
    subjects: new Int32Array(capacity + 1),
    predicates: new Int32Array(capacity + 1),
    next: new Int32Array(capacity + 1),
    previous: new Int32Array(capacity + 1),
    nextUser: new Int32Array(capacity + 1),
    previousUser: new Int32Array(capacity + 1),
    pages,
  };
}

export type MembershipIndex = ReturnType<typeof createMembershipIndex>;

/** Reserve outside a bounded mutation loop. Typed columns keep edge storage compact. */
export function reserveMemberships(index: MembershipIndex, capacity: number): void {
  if (!Number.isSafeInteger(capacity) || capacity < 0 || capacity >= 0x40000000)
    throw new RangeError('Koota: Invalid membership capacity.');
  if (capacity <= index.capacity) return;
  for (const key of [
    'subjects',
    'predicates',
    'next',
    'previous',
    'nextUser',
    'previousUser',
  ] as const) {
    const column = new Int32Array(capacity + 1);
    column.set(index[key]);
    index[key] = column;
  }
  index.capacity = capacity;
  index.table = new Int32Array(2 ** Math.ceil(Math.log2(Math.max(2, capacity * 2))));
  for (let edge = 1; edge < index.cursor; edge++) {
    if (index.previous[edge] >= 0)
      index.table[membershipBucket(index, index.subjects[edge], index.predicates[edge])] = edge;
  }
}

export function prepareMembershipEntity(index: MembershipIndex, entity: Entity): void {
  const id = getEntityId(entity);
  index.pages[id >>> 10] ??= new Int32Array(5120);
}

export function firstMembership(index: MembershipIndex, entity: Entity): number {
  const id = getEntityId(entity);
  return index.pages[id >>> 10]?.[id & 1023] ?? 0;
}

export function firstUser(index: MembershipIndex, predicate: Entity): number {
  const id = getEntityId(predicate);
  return index.pages[id >>> 10]?.[2048 + (id & 1023)] ?? 0;
}

export function countUsers(index: MembershipIndex, predicate: Entity): number {
  const id = getEntityId(predicate);
  return index.pages[id >>> 10]?.[4096 + (id & 1023)] ?? 0;
}

export function findMembership(index: MembershipIndex, entity: Entity, predicate: Entity): number {
  return index.table[membershipBucket(index, entity, predicate)];
}

/** Returns zero when full. Both entities must be prepared before entering the loop. */
export function insertMembership(index: MembershipIndex, entity: Entity, predicate: Entity): number {
  if (index.count === index.capacity) return 0;
  const edge = index.free || index.cursor++;
  if (index.free) index.free = index.next[edge];
  const id = getEntityId(entity);
  const pid = getEntityId(predicate);
  const page = index.pages[id >>> 10]!;
  const predicatePage = index.pages[pid >>> 10]!;
  const offset = id & 1023;
  const tail = page[1024 + offset];
  const user = predicatePage[2048 + (pid & 1023)];
  index.subjects[edge] = entity;
  index.predicates[edge] = predicate;
  index.previous[edge] = tail;
  index.next[edge] = 0;
  if (tail) index.next[tail] = edge;
  else page[offset] = edge;
  page[1024 + offset] = edge;
  index.previousUser[edge] = 0;
  index.nextUser[edge] = user;
  if (user) index.previousUser[user] = edge;
  predicatePage[2048 + (pid & 1023)] = edge;
  predicatePage[4096 + (pid & 1023)]++;
  index.table[membershipBucket(index, entity, predicate)] = edge;
  index.count++;
  index.version++;
  return edge;
}

export function eraseMembership(index: MembershipIndex, edge: number): void {
  const mask = index.table.length - 1;
  let hole = membershipBucket(index, index.subjects[edge], index.predicates[edge]);
  let bucket = (hole + 1) & mask;
  while (index.table[bucket]) {
    const candidate = index.table[bucket];
    const home = membershipHash(index.subjects[candidate], index.predicates[candidate], mask);
    if (((bucket - home) & mask) >= ((bucket - hole) & mask)) {
      index.table[hole] = candidate;
      hole = bucket;
    }
    bucket = (bucket + 1) & mask;
  }
  index.table[hole] = 0;
  const id = getEntityId(index.subjects[edge]);
  const pid = getEntityId(index.predicates[edge]);
  const page = index.pages[id >>> 10]!;
  const predicatePage = index.pages[pid >>> 10]!;
  const previous = index.previous[edge];
  const next = index.next[edge];
  const previousUser = index.previousUser[edge];
  const nextUser = index.nextUser[edge];
  if (previous) index.next[previous] = next;
  else page[id & 1023] = next;
  if (next) index.previous[next] = previous;
  else page[1024 + (id & 1023)] = previous;
  if (previousUser) index.nextUser[previousUser] = nextUser;
  else predicatePage[2048 + (pid & 1023)] = nextUser;
  if (nextUser) index.previousUser[nextUser] = previousUser;
  predicatePage[4096 + (pid & 1023)]--;
  index.previous[edge] = -1;
  index.subjects[edge] = 0;
  index.predicates[edge] = 0;
  index.next[edge] = index.free;
  index.free = edge;
  index.count--;
  index.version++;
}

function membershipHash(entity: Entity, predicate: Entity, mask: number): number {
  return (Math.imul(entity, 0x9e3779b1) ^ Math.imul(predicate, 0x85ebca6b)) & mask;
}

function membershipBucket(index: MembershipIndex, entity: Entity, predicate: Entity): number {
  const mask = index.table.length - 1;
  let bucket = membershipHash(entity, predicate, mask);
  let edge = index.table[bucket];
  while (edge !== 0) {
    if (index.subjects[edge] === entity && index.predicates[edge] === predicate) break;
    bucket = (bucket + 1) & mask;
    edge = index.table[bucket];
  }
  return bucket;
}
