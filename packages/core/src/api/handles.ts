/**
 * Public entity handles.
 *
 * The kernel gives every world its own dense entity indices. Public handles
 * must be unique across worlds so a bare number can find its world, so this
 * layer leases 1,024-slot pages from a global pool and maps each slot to a
 * kernel entity. A handle is `generation << 22 | pageId << 10 | offset`.
 */
import { entityAt, INDEX_MASK as LOCAL_INDEX_MASK, type Entity as LocalEntity, type World as Kernel } from '../kernel';
import type { Entity } from './entity/types';

export const PAGE_BITS = 10;
export const PAGE_SIZE = 1 << PAGE_BITS;
export const MAX_PAGES = 1 << 12;
export const ENTITY_ID_MASK = 0x3fffff;
export const GENERATION_SHIFT = 22;
export const GENERATION_MASK = 0xff;
export const MAX_GENERATION = 255;

/** Handle-owning state of a world. The world state extends this. */
export type HandleOwner = {
  readonly id: number;
  kernel: Kernel | null;
  pages: number[];
  pageCursors: number[];
  /** Recycled public indices. */
  free: number[];
  /** Public indices bound to a kernel reservation that has not been created yet. */
  reserved: Set<number>;
  /** Kernel index to public handle. */
  localToPublic: Int32Array;
};

export type Registry = {
  worlds: (HandleOwner | undefined)[];
  owners: (HandleOwner | null)[];
  generations: (Uint8Array | null)[];
  /** Kernel index per slot; 0 free. */
  locals: (Int32Array | null)[];
  freePages: number[];
  pageCursor: number;
  nextWorldId: number;
};

function createRegistry(): Registry {
  const owners: (HandleOwner | null)[] = [];
  const generations: (Uint8Array | null)[] = [];
  const locals: (Int32Array | null)[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    owners.push(null);
    generations.push(null);
    locals.push(null);
  }
  return { worlds: [], owners, generations, locals, freePages: [], pageCursor: 0, nextWorldId: 0 };
}

export let registry: Registry = createRegistry();

/** Diagnostics and test isolation. Replaces every global handle table. */
export function resetRegistry(): void {
  registry = createRegistry();
}

export function encodeHandle(generation: number, publicIndex: number): Entity {
  return ((generation << GENERATION_SHIFT) | publicIndex) as Entity;
}

export function handleIndex(handle: number): number {
  return handle & ENTITY_ID_MASK;
}

export function handleGeneration(handle: number): number {
  return (handle >>> GENERATION_SHIFT) & GENERATION_MASK;
}

export function createOwnerState(): Pick<HandleOwner, 'pages' | 'pageCursors' | 'free' | 'reserved' | 'localToPublic'> {
  return { pages: [], pageCursors: [], free: [], reserved: new Set(), localToPublic: new Int32Array(256) };
}

function leasePage(owner: HandleOwner): number {
  let pageId: number;
  if (registry.freePages.length > 0) pageId = registry.freePages.pop()!;
  else if (registry.pageCursor < MAX_PAGES) pageId = registry.pageCursor++;
  else throw new Error(`Koota: All ${MAX_PAGES} entity pages are in use.`);
  registry.owners[pageId] = owner;
  registry.generations[pageId] ??= new Uint8Array(PAGE_SIZE);
  registry.locals[pageId] ??= new Int32Array(PAGE_SIZE);
  owner.pages.push(pageId);
  owner.pageCursors.push(0);
  return pageId;
}

/** Allocates a public index, recycled or fresh, skipping retired slots. */
function allocateIndex(owner: HandleOwner): number {
  const recycled = owner.free.pop();
  if (recycled !== undefined) return recycled;
  for (;;) {
    let page = owner.pages.length - 1;
    if (page < 0 || owner.pageCursors[page] >= PAGE_SIZE) {
      leasePage(owner);
      page = owner.pages.length - 1;
    }
    const pageId = owner.pages[page];
    const offset = owner.pageCursors[page]++;
    if (registry.generations[pageId]![offset] < MAX_GENERATION) return pageId * PAGE_SIZE + offset;
  }
}

export function allocateHandle(owner: HandleOwner, local: LocalEntity): Entity {
  const publicIndex = allocateIndex(owner);
  const handle = encodeHandle(
    registry.generations[publicIndex >>> PAGE_BITS]![publicIndex & (PAGE_SIZE - 1)],
    publicIndex
  );
  bindHandle(owner, handle, local);
  return handle;
}

export function bindHandle(owner: HandleOwner, handle: Entity, local: LocalEntity): void {
  const publicIndex = handle & ENTITY_ID_MASK;
  const localIndex = local & LOCAL_INDEX_MASK;
  registry.locals[publicIndex >>> PAGE_BITS]![publicIndex & (PAGE_SIZE - 1)] = localIndex;
  if (localIndex >= owner.localToPublic.length) {
    let capacity = owner.localToPublic.length;
    while (capacity <= localIndex) capacity *= 2;
    const next = new Int32Array(capacity);
    next.set(owner.localToPublic);
    owner.localToPublic = next;
  }
  owner.localToPublic[localIndex] = handle;
}

/** Retires the slot for this generation. A recycled index carries the next generation. */
export function releaseHandle(owner: HandleOwner, handle: Entity): void {
  const publicIndex = handle & ENTITY_ID_MASK;
  const pageId = publicIndex >>> PAGE_BITS;
  const offset = publicIndex & (PAGE_SIZE - 1);
  if (registry.owners[pageId] !== owner) return;
  const generations = registry.generations[pageId]!;
  if (generations[offset] !== ((handle >>> GENERATION_SHIFT) & GENERATION_MASK)) return;
  const localIndex = registry.locals[pageId]![offset];
  if (localIndex > 0) owner.localToPublic[localIndex] = 0;
  registry.locals[pageId]![offset] = 0;
  owner.reserved.delete(publicIndex);
  if (generations[offset] < MAX_GENERATION) {
    generations[offset]++;
    owner.free.push(publicIndex);
  }
}

/** The owning world state when the handle is live, or undefined. */
export function resolveOwner(handle: number): HandleOwner | undefined {
  if (handle !== (handle & 0x3fffffff)) return undefined;
  const publicIndex = handle & ENTITY_ID_MASK;
  const pageId = publicIndex >>> PAGE_BITS;
  const owner = registry.owners[pageId];
  if (owner === null || owner === undefined) return undefined;
  const offset = publicIndex & (PAGE_SIZE - 1);
  if (registry.generations[pageId]![offset] !== ((handle >>> GENERATION_SHIFT) & GENERATION_MASK)) return undefined;
  return owner;
}

/** Local kernel entity found by the last `locate` call, or 0 when unbound. */
export let locatedLocal: LocalEntity = 0;

/** Resolves the owning world of a live handle and its kernel entity in one pass. */
export function locate(handle: number): HandleOwner | undefined {
  locatedLocal = 0;
  if (handle !== (handle & 0x3fffffff)) return undefined;
  const publicIndex = handle & ENTITY_ID_MASK;
  const pageId = publicIndex >>> PAGE_BITS;
  const owner = registry.owners[pageId];
  if (owner === null || owner === undefined) return undefined;
  const offset = publicIndex & (PAGE_SIZE - 1);
  if (registry.generations[pageId]![offset] !== ((handle >>> GENERATION_SHIFT) & GENERATION_MASK)) return undefined;
  const localIndex = registry.locals[pageId]![offset];
  if (localIndex > 0 && owner.kernel !== null) locatedLocal = entityAt(owner.kernel, localIndex);
  return owner;
}

/** Kernel entity for a live, bound handle owned by `owner`, or 0. */
export function toLocal(owner: HandleOwner, handle: number): LocalEntity {
  if (handle !== (handle & 0x3fffffff)) return 0;
  const publicIndex = handle & ENTITY_ID_MASK;
  const pageId = publicIndex >>> PAGE_BITS;
  if (registry.owners[pageId] !== owner) return 0;
  const offset = publicIndex & (PAGE_SIZE - 1);
  if (registry.generations[pageId]![offset] !== ((handle >>> GENERATION_SHIFT) & GENERATION_MASK)) return 0;
  const localIndex = registry.locals[pageId]![offset];
  if (localIndex <= 0 || owner.kernel === null) return 0;
  return entityAt(owner.kernel, localIndex);
}

export function toPublic(owner: HandleOwner, local: LocalEntity): Entity {
  return owner.localToPublic[local & LOCAL_INDEX_MASK] as Entity;
}

/** Whether a public handle is bound to a live kernel entity. A reservation awaiting creation reads as dead. */
export function isHandleAlive(handle: number): boolean {
  const owner = resolveOwner(handle);
  if (!owner || owner.kernel === null) return false;
  const publicIndex = handle & ENTITY_ID_MASK;
  const localIndex = registry.locals[publicIndex >>> PAGE_BITS]![publicIndex & (PAGE_SIZE - 1)];
  return localIndex > 0 && owner.kernel.archetypeOf[localIndex] >= 0;
}

/** Releases handles whose kernel reservation was never created. The kernel has already retired the reservations. */
export function releaseReserved(owner: HandleOwner): void {
  for (const publicIndex of owner.reserved) {
    const pageId = publicIndex >>> PAGE_BITS;
    const offset = publicIndex & (PAGE_SIZE - 1);
    releaseHandle(owner, encodeHandle(registry.generations[pageId]![offset], publicIndex));
  }
  owner.reserved.clear();
}

/** Releases every page. Used slots advance a generation so old handles stay dead. */
export function releasePages(owner: HandleOwner): void {
  for (let i = 0; i < owner.pages.length; i++) {
    const pageId = owner.pages[i];
    if (registry.owners[pageId] !== owner) continue;
    const generations = registry.generations[pageId]!;
    const locals = registry.locals[pageId]!;
    const used = owner.pageCursors[i];
    let usable = false;
    for (let offset = 0; offset < PAGE_SIZE; offset++) {
      if (offset < used && generations[offset] < MAX_GENERATION) generations[offset]++;
      locals[offset] = 0;
      if (generations[offset] < MAX_GENERATION) usable = true;
    }
    registry.owners[pageId] = null;
    if (usable) registry.freePages.push(pageId);
  }
  owner.pages.length = 0;
  owner.pageCursors.length = 0;
  owner.free.length = 0;
  owner.reserved.clear();
  owner.localToPublic.fill(0);
}

/** Token for finalization. It must never reference the world facade. */
export type CleanupToken = { id: number; owner: HandleOwner };

export function releaseByToken(token: CleanupToken): void {
  const owner = token.owner;
  releasePages(owner);
  if (registry.worlds[token.id] === owner) registry.worlds[token.id] = undefined;
}
