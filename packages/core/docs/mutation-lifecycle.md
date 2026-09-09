# Mutation lifecycle

The command engine owns structural mutations, data updates, and change
publication. It coordinates storage, indexes, and lifecycle callbacks. Scheduling
belongs to the caller. The core has no systems, frame boundaries, or dependency
analysis.

Immediate operations call the application functions directly. They do not create
command records. A command buffer records operations and `world.flush()` calls
those same application functions in order.

```ts
const Position = trait({ x: 0, y: 0 })
const Velocity = trait({ x: 0, y: 0 })
const world = createWorld()

world.add(Position, Velocity)

const commands = world.createCommandBuffer()
const entity = commands.spawn(Position({ x: 1 }))
commands.add(entity, Velocity)
commands.set(entity, Position, { x: 2 })

world.has(entity) // false
world.flush(commands)
world.has(entity) // true
```

## Commands

- `spawn(...traits)` reserves an entity handle and records its creation. The handle
  is absent from world membership and queries until playback. Later commands can
  reference it, including as a relation target.
- `add(entity, ...traits)` and `remove(entity, ...traits)` record one command per
  trait. Omitting the entity operates on the world entity.
- `set(entity, trait, value, triggerChanged?)` sets an existing trait. Omitting the
  entity operates on the world entity. An updater function runs during playback.
- `changed(entity, trait)` publishes a direct store write through the set lifecycle.
- `destroy(entity)` records entity destruction, including relation cleanup.
- `clear()` discards pending work and invalidates reserved spawn handles.

`world.flush(first, second)` consumes buffers in the supplied order and preserves
the order of their commands. Buffers are reusable after playback. A buffer belongs
to one world and becomes invalid after that world is reset or destroyed. Foreign,
expired, and duplicate buffers are rejected before playback begins.
Reset advances entity generations so old live and reserved handles do not identify
replacement entities. Reused slots do not necessarily start at generation zero.

Commands targeting dead entity generations are ignored. Setting a missing trait
does not add it. Record an add before the set when creating a new trait instance.
Flush is not a transaction. If a callback throws, completed mutations remain,
remaining commands are discarded, and the error propagates. Unused spawn
reservations are released.

Buffers retain JavaScript references and run in the world's owning runtime.
Their integer command stream is separate from a payload table. SoA field records
are shallow-copied when recorded. Nested objects and AoS values remain references,
so callers must preserve their contents until playback if they need a snapshot.
Entity reservation is synchronous and is not a worker-safe allocator.

The caller must finish recording and stop conflicting access before flushing.
Recording into a buffer submitted to the current flush is rejected.

## Trait hooks

Hooks define a trait's behavior and are fixed when the trait is created. Observers
are independent subscriptions that can be added and removed dynamically.

```ts
const Position = trait(
  { x: 0, y: 0 },
  {
    onAdd(value, entity) {
      value.x = Math.max(0, value.x)
    },
    onSet(value, entity) {
      value.x = Math.max(0, value.x)
    },
    onRemove(value, entity) {
      // The departing value and trait membership remain accessible here.
    },
  }
)
```

Hooks are synchronous. For SoA traits, `value` is a snapshot that is written back
after an add or set hook returns. For AoS traits, it is the stored object. Tag hooks
receive `undefined` as their value. Relation definitions accept a `hooks` option
with the same callbacks, which also receive the target entity as a third argument.

| Operation | Lifecycle                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Add       | Establish membership and initialize defaults plus supplied values, run `onAdd`, notify add observers, publish query notifications |
| Set       | Assign the value, run `onSet`, update change tracking, notify change observers, publish query notifications                       |
| Remove    | Notify remove observers, run `onRemove`, remove membership and update indexes, publish query notifications                        |
| Destroy   | Clean up relations and attached traits through their removal lifecycle, invalidate the entity, publish query notifications        |

Adding an existing trait is a no-op. Adding with initial values runs `onAdd`, not
`onSet`. Multiple additions are sequential: Position's add hook runs before
Velocity is added in `add(Position, Velocity)`. Spawn publishes its entity-spawn
notification after all supplied traits have been initialized.

Trait removal observers can read the departing value. Query removal observers run
after the mutation and see the updated membership. Internal query dependencies
update synchronously, separately from public notifications. Existing removed-trait
tracking can retain storage values after membership has been removed.

`onSet` signals publication, not interception of every write. `set()` runs the hook
even if change notifications are suppressed. `updateEach()` includes hooks in its
automatic change detection. Writes through `getStore()`, query pages, or
`updateEach(..., { changeDetection: 'never' })` require explicit `changed()`
publication if hooks or observers should run.

## Callback mutations

Hooks and observers may request more mutations. Those requests are queued while
the current lifecycle completes. Reads inside the callback see the current world,
not the queued mutations. A spawn inside a callback returns a reserved handle.
Subscribe to that entity after it becomes alive, or use world subscriptions.

An immediate operation drains its callback commands before returning. A flush
first applies all supplied buffers, then drains callback-generated commands in
FIFO order, including commands generated by further callbacks. Consequently,
callback-generated work can become visible at different points relative to later
explicit operations in immediate and deferred execution.

Calling `flush()`, `reset()`, or world `destroy()` from a mutation callback is
rejected. Ordinary entity operations use the queue instead of recursively
interrupting the lifecycle.

## Implementation boundaries

- `kernel/commands/operations.ts` routes public mutations to direct application or the
  callback queue.
- `kernel/commands/handlers/entity.ts`, `trait.ts`, and `changed.ts` implement structural,
  data, and publication commands. Immediate operations and the interpreter share
  these handlers.
- `kernel/commands/lifecycle.ts` protects execution, invokes trait hooks, and publishes
  query notifications.
- `kernel/commands/buffer-state.ts` owns plain buffer data and cleanup of payloads and
  entity reservations.
- `kernel/commands/recording.ts` validates and encodes commands into buffer state.
- `api/commands/command-buffer.ts` provides the public factory and thin recording
  methods. Internal callback queues use buffer state directly.
- `kernel/commands/interpreter.ts` flushes buffers in caller order, decodes opcodes and
  payloads, and calls the handlers directly.
- Storage and query modules maintain entity data and indexes. They do not choose
  when an external scheduler flushes work.
