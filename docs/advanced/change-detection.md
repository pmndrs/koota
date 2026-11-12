---
title: Change detection
description: Propagating and detecting changes
nav: 12
---

## `each`

`each` turns on change detection for traits that are being tracked via `onChange` or the `Changed` modifier. Walks over traits that nothing tracks skip it.

```js
world.onChange(Position, (entity) => {})

// Position is tracked, so entities whose position changed are reported
world.query(Position, Velocity).each((position, velocity) => {
  position.x += velocity.x
})
```

A thrown error aborts `each`. Earlier writes remain committed, and pending change notifications are not guaranteed.

Change detection shallowly compares the scalar values just like React. Tuples are stored by value and compared per element, so mutating one in place is detected. Other objects and arrays will only be detected as changed if a new object or array is committed to the store. While immutable state is a great design pattern, it creates memory pressure and reduces performance so instead you can mutate and manually flag that a change has occurred.

```js
// ❌ This change will not be detected since the array is mutated and will pass the comparison
world.query(Inventory).each((inventory) => {
  inventory.items.push(item)
})

// ✅ This change will be detected since a new array is created and the comparison will fail
world.query(Inventory).each((inventory) => {
  inventory.items = [...inventory.items, item]
})

// ✅ This change is manually flagged and we still get to mutate for performance
world.query(Inventory).each((inventory, entity) => {
  inventory.items.push(item)
  entity.changed()
})
```
