import {
  Any,
  compilePlan,
  defineTrait,
  entityAt,
  getTypeVersion,
  isPair,
  pair,
  pairRelation,
  pairTargetIndex,
  setTraitHooks,
  type Entity as LocalEntity,
  type Factory as KernelFactory,
  type Schema as KernelSchema,
  type TraitHook as KernelTraitHook,
  type TypeId,
  type World as Kernel,
} from '../../kernel';
import type { Entity } from '../entity/types';
import { resolveOwner, toPublic } from '../handles';
import type { RelationPair } from '../relation/types';
import { $internal, $relationPair } from '../symbols';
import type { WorldState } from '../world/state';
import type {
  Norm,
  Schema,
  StoreType,
  TagTrait,
  Trait,
  TraitHook,
  TraitValue,
  VersionSource,
} from './types';

/** Trait descriptors by kernel trait id, so kernel events map back to traits. */
export const traitsById: (Trait | undefined)[] = [];

const tagSchema = /* @__PURE__ */ Object.freeze({});

type HookName = 'onAdd' | 'onSet' | 'onRemove';

/** Public entity handle for a kernel entity, through the world's state. */
function publicEntity(kernel: Kernel, local: LocalEntity): Entity {
  return toPublic(kernel.context as WorldState, local);
}

/** Wraps a public hook so the kernel can call it with kernel identities. */
function adaptHook(hook: TraitHook): KernelTraitHook {
  return (kernel, local, type, value) => {
    const entity = publicEntity(kernel, local);
    if (isPair(type)) hook(value as never, entity, publicEntity(kernel, entityAt(kernel, pairTargetIndex(type))));
    else hook(value as never, entity);
  };
}

/** Hook methods stay off `Object.keys`, like the internal symbol. */
export function defineHookMethods(target: object, methods: Record<string, (...args: never[]) => unknown>): void {
  for (const name of Object.keys(methods)) {
    Object.defineProperty(target, name, { value: methods[name], writable: false, enumerable: false, configurable: false });
  }
}

/** Installs one hook on the kernel definition. The kernel rejects duplicates and late installs. */
export function installHook<S extends Schema>(trait: Trait<S>, name: HookName, hook: TraitHook<S>): Trait<S> {
  if (typeof hook !== 'function') throw new Error(`Koota: ${name} requires a function.`);
  const internal = trait[$internal];
  setTraitHooks(internal.id, { [name]: adaptHook(hook as TraitHook) });
  internal.hooks[name] = hook;
  return trait;
}

/** Factories that declare a parameter receive the public entity. */
function toKernelFactory(factory: (entity: Entity) => unknown): KernelFactory {
  if (factory.length === 0) return factory as unknown as KernelFactory;
  return (kernel, local) => factory(publicEntity(kernel, local));
}

export function toKernelSchema(schema: Schema): KernelSchema {
  if (typeof schema === 'function') return toKernelFactory(schema);
  let translated: Record<string, unknown> | null = null;
  for (const key of Object.keys(schema)) {
    const value = (schema as Record<string, unknown>)[key];
    if (typeof value !== 'function' || value.length === 0) continue;
    if (translated === null) translated = { ...schema };
    translated[key] = toKernelFactory(value as (entity: Entity) => unknown);
  }
  return translated ?? (schema as KernelSchema);
}

export function createTraitWithId<S extends Schema>(id: number, schema: S): Trait<Norm<S>> {
  const isAoS = typeof schema === 'function';
  const isTag = !isAoS && Object.keys(schema).length === 0;
  const type: StoreType = isAoS ? 'aos' : isTag ? 'tag' : 'soa';
  const descriptor = ((params?: TraitValue<Norm<S>>) => [descriptor, params]) as Trait<Norm<S>>;
  descriptor[$internal] = {
    id,
    schema: schema as unknown as Norm<S>,
    type,
    hooks: {},
    relation: null,
  };
  defineHookMethods(descriptor, {
    onAdd: (hook: TraitHook<Norm<S>>) => installHook(descriptor, 'onAdd', hook),
    onSet: (hook: TraitHook<Norm<S>>) => installHook(descriptor, 'onSet', hook),
    onRemove: (hook: TraitHook<Norm<S>>) => installHook(descriptor, 'onRemove', hook),
  });
  traitsById[id] = descriptor;
  return descriptor;
}

export function trait(schema?: Record<string, never>): TagTrait;
export function trait<S extends Schema>(schema: S): Trait<Norm<S>>;
export function trait<S extends Schema>(schema: S = tagSchema as S): Trait<Norm<S>> {
  const kernelSchema = toKernelSchema(schema);
  compilePlan(kernelSchema);
  return createTraitWithId(defineTrait(kernelSchema), schema);
}

/** Trait descriptor for a kernel type, resolving pairs to their relation trait. */
export function traitOfType(type: TypeId): Trait | undefined {
  return traitsById[isPair(type) ? pairRelation(type) : type];
}

/** Stable revision source for one trait in a world, replaced when the world resets. */
export function getTraitVersionSource(entity: Entity, input: Trait | RelationPair): VersionSource | undefined {
  const owner = resolveOwner(entity) as WorldState | undefined;
  if (!owner || !owner.kernel) return undefined;
  const target = (input as RelationPair)[$relationPair]
    ? (input as RelationPair).relation[$internal].trait
    : (input as Trait);
  // A relation's revision lives on its aggregate, which every pair write advances.
  const relation = target[$internal].relation;
  const id = relation ? pair(relation[$internal].id, Any) : target[$internal].id;
  const kernel = owner.kernel;
  if (!owner.traits.has(target)) return undefined;
  let source = owner.versionSources.get(id);
  if (!source) {
    source = {
      get version() {
        return getTypeVersion(kernel, id);
      },
    };
    owner.versionSources.set(id, source);
  }
  return source;
}
