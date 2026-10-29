---
title: Change detection
description: Propagating and detecting changes
nav: 12
---

## `updateEach`

By default, `updateEach` will automatically turn on change detection for traits that are being tracked via `onChange` or the `Changed` modifier. If you want to silence change detection for a loop or force it to always run, you can do so with an options config.

```js
// Suppress change notifications
world.query(Position, Velocity).updateEach(([position, velocity]) => {}, { changeDetection: 'never' })

// Notify for every accepted write, including unchanged values
world
  .query(Position, Velocity)
  .updateEach(([position, velocity]) => {}, { changeDetection: 'always' })
```

A thrown error aborts `updateEach`. Earlier writes remain committed, and pending change notifications are not guaranteed.

Change detection shallowly compares the scalar values just like React. Tuples are stored by value and compared per element, so mutating one in place is detected. Other objects and arrays will only be detected as changed if a new object or array is committed to the store. While immutable state is a great design pattern, it creates memory pressure and reduces performance so instead you can mutate and manually flag that a change has occurred.

```js
// ❌ This change will not be detected since the array is mutated and will pass the comparison
world.query(Inventory).updateEach(([inventory]) => {
  inventory.items.push(item)
})

// ✅ This change will be detected since a new array is created and the comparison will fail
world.query(Inventory).updateEach(([inventory]) => {
  inventory.items = [...inventory.items, item]
})

// ✅ This change is manually flagged and we still get to mutate for performance
world.query(Inventory).updateEach(([inventory], entity) => {
  inventory.items.push(item)
  entity.changed()
})
```
