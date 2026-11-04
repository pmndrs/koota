import { assert, bench, group } from '@pmndrs/labs';
import { createWorld, ordered, relation, trait, type Entity } from 'koota';

/** Mirrors private fields so this diagnostic uses the compiled public package. */
type EntityView = Iterable<Entity> & {
  ctx: unknown;
  query: unknown;
  binding: unknown;
  source: { dense: readonly number[]; readonly length: number };
  live: boolean;
  layout: unknown;
  iterator: unknown;
  readonly length: number;
  each(callback: (position: { x: number }) => void): unknown;
};

type OrderedSource = EntityView['source'] & {
  iterating: number;
  views: EntityView[];
};

type RelationView = EntityView & {
  source: OrderedSource;
  parent: Entity;
  relation: unknown;
  trait: unknown;
};

/** Reuses the exact runtime methods to isolate allocation and object layout from behavior. */
function createView(prototype: object, original: EntityView): EntityView {
  return {
    __proto__: prototype,
    ctx: original.ctx,
    query: original.query,
    binding: original.binding,
    source: original.source,
    live: original.live,
    layout: undefined,
    iterator: undefined,
  } as unknown as EntityView;
}

function createSource(original: OrderedSource): OrderedSource {
  return {
    __proto__: Object.getPrototypeOf(original),
    dense: original.dense,
    iterating: 0,
    views: [],
  } as unknown as OrderedSource;
}

function createSortedSource(original: OrderedSource): OrderedSource {
  const state = original as OrderedSource & Record<string, unknown>;
  return {
    __proto__: Object.getPrototypeOf(original),
    dense: original.dense,
    iterating: 0,
    views: [],
    base: state.base,
    compare: state.compare,
    traits: state.traits,
    instances: state.instances,
    revisions: state.revisions,
    revision: state.revision,
    dirty: state.dirty,
    refreshing: false,
  } as unknown as OrderedSource;
}

function createRelationView(original: RelationView): RelationView {
  return {
    __proto__: Object.getPrototypeOf(original),
    ctx: original.ctx,
    query: original.query,
    binding: original.binding,
    source: createSource(original.source),
    live: original.live,
    layout: undefined,
    iterator: undefined,
    parent: original.parent,
    relation: original.relation,
    trait: original.trait,
    active: true,
    inserting: undefined,
    insertIndex: 0,
  } as unknown as RelationView;
}

function createIterator(view: EntityView): EntityView['iterator'] {
  const original = view[Symbol.iterator]();
  original.return?.();
  return {
    __proto__: Object.getPrototypeOf(original),
    value: 0 as Entity,
    done: true,
    index: 0,
    length: 0,
    dense: [],
    guard: null,
    view,
  } as unknown as EntityView['iterator'];
}

group('view allocation 128 @view-representation @view-allocation', () => {
  for (const mode of [
    'class',
    'constructor function',
    'literal prototype',
    'create and assign',
  ] as const) {
    bench(mode, function* () {
      const world = createWorld();
      const Tag = trait();
      for (let i = 0; i < 32; i++) world.spawn(Tag);
      const original = world.query(Tag) as unknown as EntityView;
      const prototype = Object.getPrototypeOf(original);
      const View = prototype.constructor as new (
        ctx: EntityView['ctx'],
        query: EntityView['query'],
        binding: EntityView['binding'],
        source: EntityView['source'],
        live: boolean
      ) => EntityView;
      assert.equal(View.name, 'View');
      function ViewState(
        this: EntityView,
        ctx: unknown,
        query: unknown,
        binding: unknown,
        source: EntityView['source'],
        live: boolean
      ) {
        this.ctx = ctx;
        this.query = query;
        this.binding = binding;
        this.source = source;
        this.live = live;
        this.layout = undefined;
        this.iterator = undefined;
      }
      ViewState.prototype = prototype;
      const Constructor = ViewState as unknown as typeof View;
      const { ctx, query, binding, source, live } = original;
      const create =
        mode === 'class'
          ? () => new View(ctx, query, binding, source, live)
          : mode === 'constructor function'
            ? () => new Constructor(ctx, query, binding, source, live)
            : mode === 'literal prototype'
              ? () =>
                  ({
                    __proto__: prototype,
                    ctx,
                    query,
                    binding,
                    source,
                    live,
                    layout: undefined,
                    iterator: undefined,
                  }) as unknown as EntityView
              : () =>
                  Object.assign(Object.create(prototype), {
                    ctx,
                    query,
                    binding,
                    source,
                    live,
                    layout: undefined,
                    iterator: undefined,
                  });
      const retained: EntityView[] = [];
      yield {
        bench: () => {
          for (let i = 0; i < 128; i++) retained[i] = create();
        },
        snapshot: () => {
          const count = retained.reduce((sum, view) => sum + view.length, 0);
          assert.equal(count, 4096);
          return count;
        },
      };
      world.destroy();
    });
  }
});

/** Reference for the original data-only class, compared with the current literal representation. */
class EntityList {
  dense: readonly number[];
  length: number;

  constructor(dense: readonly number[]) {
    this.dense = dense;
    this.length = dense.length;
  }
}

group('entity list allocation 128 @view-representation @view-allocation', () => {
  for (const mode of ['class', 'literal'] as const) {
    bench(mode, function* () {
      const world = createWorld();
      const ChildOf = relation();
      const parent = world.spawn();
      for (let i = 0; i < 32; i++) world.spawn(ChildOf(parent));
      const original = world.query(ChildOf(parent)) as unknown as EntityView;
      const dense = original.source.dense;
      const create =
        mode === 'class' ? () => new EntityList(dense) : () => ({ dense, length: dense.length });
      const retained: EntityView['source'][] = [];
      yield {
        bench: () => {
          for (let i = 0; i < 128; i++) retained[i] = create();
        },
        snapshot: () => {
          const count = retained.reduce((sum, source) => sum + source.length, 0);
          assert.equal(count, 4096);
          return count;
        },
      };
      world.destroy();
    });
  }
});

for (const count of [32, 10_000]) {
  for (const kind of ['query', 'sorted', 'relation'] as const) {
    group(`${kind} representation ${count} @view-representation`, () => {
      for (const representation of ['class', 'factory'] as const) {
        for (const access of ['for of', 'each'] as const) {
          bench(`${representation} ${access}`, function* () {
            const world = createWorld();
            const Position = trait({ x: 1 });
            const ChildOf = relation();
            const Children = ordered(ChildOf);
            const parent = world.spawn(Children);
            for (let i = 0; i < count; i++) world.spawn(Position, ChildOf(parent));
            const query = world.query(Position);
            const original = (kind === 'query'
              ? query
              : kind === 'sorted'
                ? query.sort((a, b) => a - b, [Position])
                : parent.get(Children)!) as unknown as EntityView;
            if (kind === 'relation') original.binding = (query as unknown as EntityView).binding;
            if (kind !== 'sorted') original[Symbol.iterator]().return?.();
            let view = original;
            if (representation === 'factory') {
              view =
                kind === 'relation'
                  ? createRelationView(original as RelationView)
                  : createView(Object.getPrototypeOf(original), original);
              if (kind === 'sorted')
                view.source = createSortedSource(original.source as OrderedSource);
              if (kind !== 'sorted') view.iterator = createIterator(view);
            }
            const expected = query.toArray().reduce((sum, entity) => (sum + entity) | 0, 0);
            let sum = 0;
            const walk =
              access === 'for of'
                ? () => {
                    let result = 0;
                    for (const entity of view) result = (result + entity) | 0;
                    sum = result;
                  }
                : () => {
                    let result = 0;
                    view.each((position) => {
                      result += position.x;
                    });
                    sum = result;
                  };
            yield {
              bench: walk,
              snapshot: () => {
                assert.equal(sum, access === 'for of' ? expected : count);
                return count;
              },
            };
            world.destroy();
          });
        }
      }
    });
  }
}
