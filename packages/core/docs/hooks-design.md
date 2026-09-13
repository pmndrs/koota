# Trait hooks

Hooks let a trait own its behavior: normalize values on write, initialize on
add, release resources on remove, and decide what happens to a relation when
its target dies. This note records the shipped design: the public shape, the
kernel mechanism, and the cost of each hook, so that a hook never costs more
than its table entry says.

The model follows Flecs type hooks rather than Iris, which has no per-type
hooks and relies on observers alone. Flecs binds one hook set per type, runs
hooks from the mutation path itself, and precomputes per-table flags so the
no-hook path pays one test. Koota keeps its many-per-world subscriptions as the
observer layer on top.

## Public API

```ts
const Position = trait({ x: 0, y: 0 }).onSet((value) => {
  if (value.x < 0) value.x = 0;
  if (value.y < 0) value.y = 0;
});

const Mesh = trait(() => new THREE.Mesh()).onRemove((mesh) => mesh.geometry.dispose());

const ChildOf = relation({ exclusive: true }).onTargetDestroy((_, child) => child.destroy());
```

| Method                | Available on         | Signature                          |
| --------------------- | -------------------- | ---------------------------------- |
| `onAdd(fn)`           | traits and relations | `(value, entity, target?) => void` |
| `onSet(fn)`           | traits and relations | `(value, entity, target?) => void` |
| `onRemove(fn)`        | traits and relations | `(value, entity, target?) => void` |
| `onTargetDestroy(fn)` | relations only       | `(value, source, target) => void`  |

Rules:

- Each method installs one hook and returns the same trait or relation, so
  calls chain. The trait's identity does not change, and the methods are not
  enumerable.
- A hook slot can be filled once. A second call throws.
- Hooks must be installed before the trait is used in any world. Installing
  after use throws, so per-archetype hook tables never rebuild.
- `value` is the SoA record, the AoS instance, or `undefined` for a tag.
  Relation hooks always receive the target.
- The `hooks` option on `trait()` and `relation()` is gone. Migration is
  mechanical: `trait(schema, { onAdd })` becomes `trait(schema).onAdd(fn)`.
- Factories that declare a parameter receive the entity they construct for,
  for AoS traits and schema fields alike. This replaced the internal
  ordered-list initializer.

## Initialization is create, then set

There are no initializers. Create constructs a trait from its schema, set
applies values, and adding a trait with a value is the two in sequence. The
observable consequences:

- `onAdd` sees what the schema constructs, never the supplied value.
- `onSet` runs for a supplied value, so validation lives in one place.
- A value supplied at add time counts as a change: `onChange` subscribers
  fire, and `Changed` trackers report the entity. Adding without a value does
  not.
- An AoS instance supplied at add time is the constructed value. The factory
  does not run, so no throwaway instance is built.

Without hooks the kernel fuses both steps into one column pass, so the cost of
"create, then set" with no hooks is the old single initialization plus one
change stamp.

## Semantics

Hooks run closest to the data, and listeners only hear about state that no
hook will still change. On add, the add hook and then the set hook complete
before observers see the add; the change publishes after it. On remove the
hook runs after listeners, so listeners can still read the value before the
trait's own cleanup.

| Operation                      | Order                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| add, spawn                     | move to archetype, construct from schema, **onAdd**, write, supplied value through **onSet**, write, version, add subscribers, query add events, change subscribers, query change events |
| set                            | read current record, merge partial, **onSet**, write once, stamp, change subscribers, query change events                                                        |
| markChanged, updateEach writes | read record, **onSet**, write back, stamp, change subscribers, query change events                                                                                |
| remove                         | remove subscribers, **onRemove** with value readable, move, query remove events                                                                                   |
| destroy                        | entityDestroying, own pairs removed, **onTargetDestroy** per source of pairs targeting the entity, then the relation's `autoDestroy` policy, then per trait: remove subscribers and **onRemove**, row removal, entityDestroyed |

Consequences worth stating:

- A throw inside `onSet` aborts the write; the previous value stays. A throw
  inside `onAdd` still commits the record as the hook left it, because the
  trait is already attached and blank columns would be worse.
- Multi-trait `add` and `spawn` are one archetype transition. `onAdd` hooks
  run after the entity is placed, in entry order, and can see the other traits
  of the same call. Add subscribers still make a multi-trait `add` apply one
  trait at a time; `spawn` applies in one transition regardless, since the
  kernel creates deferred spawns from their entries.
- Mutations issued from a hook queue in the kernel and play when the operation
  that ran the hook returns, so a hook that destroys its own entity sees the
  add complete first. This is the kernel's mutation scope, not a layer above.
- `onRemove` cannot veto. Mutating `value` inside it has no effect.
- `onTargetDestroy` runs while the target is still readable and before the
  pair is removed. When the hook returns, the kernel removes the pair if the
  source still holds it, so no live state references a dead target. If the
  hook destroys the source, the pair leaves with it. `autoDestroy: 'orphan'`
  stays as the built-in cascade and applies after the hook, using the
  kernel's destroy queue rather than recursion.
- Hooks run inside the kernel call, so mutations they issue queue at depth one
  and play when the operation returns, as before.
- Writes through `getPages` columns bypass hooks until `markChanged` is called.
  `updateEach` keeps running `onSet` for traits it detects as changed.

## Kernel mechanism

- `Definition.hooks` holds `{ onAdd, onSet, onRemove, onTargetDestroy }` with
  the kernel signature `(world, entity, type, value)`, and
  `(world, source, pair, value)` for target destruction. `setTraitHooks(id, hooks)`
  fills slots and throws on a duplicate slot, on a definition already in use,
  and on `onTargetDestroy` for a plain trait.
- `Definition.used` is set when the trait first enters an archetype or a pair
  store.
- Each archetype's type records carry the remove hook, so destroy pays one
  array read per trait. Relation aggregates carry no hooks;
  concrete pairs use their relation's.
- `addTrait`, `setTrait`, `setValue`, `markChanged`, and `removeTrait` read
  `definition.hooks` once. Records are only materialized when a hook exists.
  After a hook returns, storage is resolved again before writing, because
  kernel-level hooks may move the entity.
- The kernel `World` has a `context` slot. The API stores its `WorldState`
  there, and the adapter installed by `trait().onSet(fn)` translates kernel
  identities to public handles through it. Factories that take a parameter are
  wrapped the same way; zero-parameter factories pass straight through.
- Subscriptions keep using kernel observers, but each world attaches
  `traitAdded`, `traitRemoving`, and `traitChanged` observers only when its
  first subscription is created. `entityDestroyed` stays attached for handle
  release.

## Cost

Costs are per operation on one entity. "Record" means one read or write per
field of an SoA trait.

| Operation        | No hook                                   | Hook on SoA trait                                     | Hook on AoS trait or tag |
| ---------------- | ----------------------------------------- | ----------------------------------------------------- | ------------------------ |
| add with value   | one definition read, one change stamp     | record build, one call, record write, then as set      | one call, then as set    |
| add without value| one definition read                       | record build, one call, record write                   | one call                 |
| set              | one definition read                       | record read, one call, record write                    | one call                 |
| markChanged      | one definition read                       | record read, one call, record write                    | one call                 |
| remove           | one definition read                       | record read, one call                                  | one call                 |
| spawn            | as add, per trait                         | as add, per hooked trait                               | as add                   |
| destroy          | one array read per trait                  | as remove, per hooked trait                            | as remove                |
| target destroyed | policy only                               | record read and one call per source                    | one call per source      |

Measured on the scratch benches after the change: a kernel set moved from
392 µs to about 450 µs per 10,000 calls for the definition read, and cold
population with one value per trait moved from 1.8 ms to about 2.7 ms per
10,000 entities for the change stamps. Hooked operations add one record
allocation, one call, and one column pass.

## Not included

- No copy or move hooks. Moving an entity between archetypes copies references,
  the AoS factory is the constructor, and `onRemove` is the destructor.
- No reason argument on `onRemove` to distinguish remove, destroy, and target
  cleanup. It can be added later without changing the shape.
- No per-trait equality hook for `updateEach` change detection. The auto mode
  still snapshots and compares hooked SoA traits per visited entity, and
  spreads AoS instances into copies. That is the one remaining cost that is
  not visible at the call site and deserves its own decision.

## Decisions taken

1. `autoDestroy` policies stay next to `onTargetDestroy`. The built-in cascade
   uses the destroy queue and stays cheap; the hook runs first.
2. Hook values are fresh objects. A reused scratch record was not measured
   worth the retention hazard.
3. Hooks throw when installed after use, so the cost model has no hidden
   rebuild.
4. Add subscribers see the supplied value. Hooks keep the Flecs order, but the
   add publishes only after the value and its set hook are applied.
