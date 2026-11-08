---
title: State machines
description: Mutually exclusive traits with explicit transitions
nav: 10
---

`machine({ states, initial, transitions? })` groups ordinary traits into mutually exclusive states. An entity holds exactly one state while it has the machine. States keep their schemas, stores, queries and hooks.

```ts
import { machine, trait } from 'koota'

const Pending = trait()
const Loading = trait({ progress: 0 })
const Loaded = trait()
const AssetMachine = machine({
  states: { Pending, Loading, Loaded },
  initial: Pending,
  transitions: {
    Pending: [Loading],
    Loading: [Loading, Pending, Loaded],
    Loaded: [Pending],
  },
})
```

State names resolve transition-table keys. Declare a machine before any member is registered in any world, including through a query or subscription. A trait belongs to at most one machine. States must be ordinary traits, not relations, identifiers, ordered views or other machines. The initial state must have defaults. Other states can require values.

Omitting `transitions` allows every edge. With a table, omitted sources have no outgoing edges. Edge checks follow `__KOOTA_ASSERTS__`, enabled by default outside production. Mutual exclusion applies in every build.

## Entering and reading

```ts
const entity = world.spawn(AssetMachine) // Pending
world.spawn(Loading({ progress: 0 })) // Also has AssetMachine
world.spawn(AssetMachine, Loading({ progress: 0.25 })) // Loading, without entering Pending

AssetMachine.enter(entity, Loading({ progress: 0.5 }))
AssetMachine.current(entity) === Loading
entity.has(AssetMachine) // true
entity.get(Loading) // { progress: 0.5 }
```

`current` returns the current member or `undefined`, using membership masks without allocating. An explicit member overrides a bare machine in the same `spawn` or `add` call, regardless of argument order. Different members of one machine in a single call are rejected before changing that machine. Other arguments retain ordinary argument-order mutation behavior.

`enter` can attach a missing machine directly in any member. The initial state is used only when adding a bare machine. Entering the current state requires a self-edge when a table is supplied and replaces its data using defaults for omitted fields. `set` updates data without a transition.

`entity.add(member)` swaps states without checking the table. It is useful for restoration and tests. Adding the current member is a no-op, including when values are supplied. `upsert(member, value)` writes the current member or performs an unchecked swap when absent. Adding the bare machine is a no-op when it is already present.

## Removing

```ts
entity.remove(AssetMachine) // Clears this entity's asset loading state
```

Removing the current member directly throws `[MACHINE_STATE_REQUIRED]`. Removing an absent member is a no-op. Destruction and world reset remove machines through the same lifecycle. Multiple machines on one entity are independent.

## Queries and iteration

```ts
import { createAdded, createRemoved, createChanged, Not } from 'koota'

const Added = createAdded()
const Removed = createRemoved()
const Changed = createChanged()

world.query(Loading)
world.query(AssetMachine) // Any state, with no data argument for AssetMachine
world.query(Not(AssetMachine))
world.query(Added(Loading))
world.query(Removed(Loading))
world.query(Changed(Loading))
```

A swap commits the old and new membership together. A query matching both states stays matched. `Added(AssetMachine)` and `Removed(AssetMachine)` track attachment and detachment of the whole machine, not internal transitions.

Trackers retain their ordinary semantics. `Changed` includes additions and writes. Trackers coalesce changes and do not record an event history. Entering then leaving a state before reading `Added` removes that pending match. Re-entering a state clears its pending `Removed` match. Use transition callbacks to observe each transition.

Inside `each`, membership changes immediately, including for `has`, `current` and nested queries. Only removal from the active query's backing collection is deferred. The walk keeps its starting sequence and does not revisit a transitioned entity. Stop using a state's borrowed callback value after transitioning away or re-entering it. Iterator writeback will not overwrite a replacement state.

## Transition callbacks

```ts
const unsubscribe = world.onTransition(AssetMachine, (entity, from, to, previous) => {
  if (from === Loading && previous && 'progress' in previous) {
    console.log('Previous loading progress', previous.progress)
  }
})

const unsubscribeEntity = entity.onTransition(AssetMachine, (entity, from, to, previous) => {
  // Observes only this entity.
})
```

`from` is `undefined` on attachment. `to` is `undefined` on removal or destruction. Callbacks report explicit re-entry and unchecked swaps too. Data-only writes and duplicate adds do not produce transitions.

Only listeners registered when a transition starts are eligible for that transition. Unsubscribing before delivery cancels it. Listeners added during a callback observe subsequent transitions.

`previous` is captured before removal callbacks. It is a snapshot for schema traits, the previous stored value for callback traits, and `undefined` for tags or initial attachment. Callback trait objects are references, not deep copies. Ordinary `get` always reads current membership and data, including during a self-transition.

The order is destination preparation, old member `onRemove`, machine `onRemove` on detachment, membership and query reconciliation, query callbacks, new member `onAdd` and `onChange`, machine addition callbacks on attachment, then world and entity transition callbacks. Removal callbacks can still read the old member. Post-commit callbacks see the new membership, including relation-target query filters.

Before delivering a queued static-query notification, its membership is checked again. An earlier callback that destroys an entity or changes whether it matches can invalidate a pending notification, which is then skipped. Tracking queries retain their existing event semantics.

Machine changes or destruction of the same entity during these callbacks throw `[MACHINE_REENTRANT]`. Other entities can transition. Perform follow-up transitions after the current call returns. Entering a state during that entity's destruction is rejected.

Initialization failure or a throwing removal callback leaves the old membership intact. A callback throwing after the commit leaves the new membership intact and stops subsequent callback delivery. There is no rollback of user callback effects.

## React

```ts
import { useMachine } from 'koota/react'

const state = useMachine(entity, AssetMachine)
```

The hook returns the current member and updates on transitions, including self-transitions, removal and destruction. It accepts an entity, world singleton, `null` or `undefined`.

## Svelte

```ts
import { useMachine } from 'koota/svelte'

const state = useMachine(() => entity, AssetMachine)
state.current // Current member trait or undefined
```

The binding follows the same transitions as the React hook. Pass the entity or world singleton through a getter, which may return `null` or `undefined`. The machine can also be a getter. See the [Svelte API](../svelte/api.md#usemachine) for component usage.

## Errors

| Error                          | Meaning                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| `[MACHINE_MULTIPLE_STATES]`    | One add or spawn call supplies different states of one machine. |
| `[MACHINE_ILLEGAL_TRANSITION]` | An edge is absent from the table, when assertions are enabled.  |
| `[MACHINE_STATE_REQUIRED]`     | Direct removal would leave the machine without a state.         |
| `[MACHINE_MEMBER_TAKEN]`       | A member already belongs to a machine.                          |
| `[MACHINE_REGISTERED]`         | A member was registered before machine declaration.             |
| `[MACHINE_STATES]`             | States are empty, duplicated or not ordinary traits.            |
| `[MACHINE_INITIAL]`            | The initial state is not a member with defaults.                |
| `[MACHINE_TRANSITIONS]`        | A table source or target is not a member.                       |
| `[MACHINE_STATE]`              | `enter` receives a nonmember.                                   |
| `[MACHINE_REENTRANT]`          | A callback changes a machine or destroys the same entity.       |
| `[MACHINE_DESTROYING]`         | An entity being destroyed attempts to enter a state.            |

Machines provide no clocks, guards or effects. Keep timed conditions and transition decisions in systems and actions.
