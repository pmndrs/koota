import { $internal } from '../internal';
import { createRecordFunction, createSchemaAccessors } from '../storage/accessors';
import { isRequired, validateSchema } from '../storage/schema';
import { createClearFunction, createStore } from '../storage/stores';
import type { Norm, StoreType, TraitSchema } from '../storage/types';
import type {
  RequiresInit,
  TagTrait,
  Trait,
  TraitAccessors,
  TraitContext,
  TraitInit,
  TraitInput,
  TraitKind,
} from './types';

const tagSchema = Object.freeze({});
let traitId = 0;

function createTrait(schema?: Record<string, never>): TagTrait;
function createTrait<S extends TraitSchema>(schema: S): Trait<Norm<S>>;
function createTrait<S extends TraitSchema>(schema: S = tagSchema as S): Trait<Norm<S>> {
  return createTraitDefinition(schema, 'trait');
}

export const trait = createTrait;

/** The kind controls membership. The schema supplies storage accessors unless the caller provides them. */
export function createTraitDefinition<S extends TraitSchema>(
  schema: S,
  kind: Exclude<TraitKind, 'machine'>,
  accessors?: TraitAccessors<S>
): Trait<Norm<S>> {
  const isAoS = typeof schema === 'function';
  const isTag = !isAoS && Object.keys(schema).length === 0;
  const type: StoreType = isAoS ? 'aos' : isTag ? 'tag' : 'soa';

  validateSchema(schema);

  const { add, set, get, getInto, remove, cursor } = accessors ?? createSchemaAccessors(schema, type);
  const context: TraitContext<S> = {
    id: traitId++,
    createStore: () => createStore(schema),
    clear: createClearFunction(schema),
    add,
    set,
    get,
    getInto,
    remove,
    cursor,
    registered: false,
    onRegister: undefined,
    machine: undefined,
    relation: null,
    kind,
    identifier: undefined,
    type,
    required: (isRequired(schema) || Object.values(schema).some(isRequired)) as RequiresInit<S>,
  };
  const Trait = Object.assign(
    (params: TraitInit<Norm<S>>): [Trait<Norm<S>>, TraitInit<Norm<S>>] => [Trait, params],
    { [$internal]: context }
  ) as unknown as Trait<Norm<S>>;

  Object.defineProperty(Trait, 'id', {
    value: context.id,
    writable: false,
    enumerable: true,
    configurable: false,
  });

  Object.defineProperty(Trait, 'schema', {
    value: schema,
    writable: false,
    enumerable: true,
    configurable: false,
  });

  // Most traits never build a record, so the builder compiles on first use.
  let create: (() => unknown) | undefined;
  Object.defineProperty(Trait, 'record', {
    value: () => (create ??= createRecordFunction[context.type](schema))(),
    writable: false,
    enumerable: false,
    configurable: false,
  });

  return Trait;
}

/** Relations and identifiers use a backing trait for presence, queries and subscriptions. */
export function resolveTrait(input: TraitInput): Trait {
  const context = input[$internal];
  return ('trait' in context ? context.trait : input) as Trait;
}

function requirePair(): never {
  throw new Error('Koota: [NO_ACCESSORS] Use a pair to write a relation or identifier.');
}

/** The backing trait represents membership. Data belongs to the pair. */
export const pairTraitAccessors: TraitAccessors = {
  add: requirePair,
  set: requirePair,
  get: () => undefined,
  getInto: () => undefined,
  remove: requirePair,
  cursor: undefined,
};
