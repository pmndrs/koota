# Building a App

This will be a brief introduction to thinking about building an app with Koota along with some patterns.

## Data-oriented design

Koota is data-oriented, or data-first, which means that behavior is separated from data. An object, for example, is not data-oriented since it has the the data and behavior coupled together as methods. This allows for _composability_ of both data and behavior.

```js
const Position = trait({ x: 0, y: 0 })
const Velocity = trait({ x: 0, y: 0 })

const world = createWorld()
const entity = world.spawn(Position)
const movingEntity = world.spawn(Position, Velocity)
```

A system is then a function that queries for entities that has the data that will be transformed and then batch updates them.

```js
function updateMovement(world, delta) {
  world.query(Position, Velocity).updateEach(([pos, vel]) => {
    pos.x += vel.x * delta
    pos.y += vel.y * delta
  })
}
```

Systems are usually run in a frame loop with a determinstic order.

```js
let lastTime = performance.now()
function loop() {
  const now = performance.now()
  const delta = (now - lastTime) / 1000
  lastTime = now

  updateMovement(world, delta)
  requestAnimationFrame(loop)
}
loop()
```

But can also be run in an event.

```js
const Pointer = trait({ x: 0, y: 0 })

function updatePointer((world, event) => {
    world.set(Pointer, { x: e.clientX, y: e.clientY })
})

window.addEventListener('mousemove', (event) => updatePointer(world, event))
```

This allows for easily composing behavior and with HMR, you can even add an remove systems during runtime!

```js
const Acceleration = trait({ x: 0, y: 0 })

// System 1: Apply acceleration to velocity
function applyAcceleration(world, delta) {
  world.query(Velocity, Acceleration).updateEach(([vel, acc]) => {
    vel.x += acc.x * delta
    vel.y += acc.y * delta
  })
}

// System 2: Apply velocity to position
function applyVelocity(world, delta) {
  world.query(Position, Velocity).updateEach(([pos, vel]) => {
    pos.x += vel.x * delta
    pos.y += vel.y * delta
  })
}

// Run them in a deterministic order
applyAcceleration(world, delta)
applyVelocity(world, delta)

// Composed: entities with all three traits get full physics
const ball = world.spawn(Position, Velocity, Acceleration({ x: 0, y: -9.8 }))
```

## Decoupling from the view

Along with decoupling data and behavior, a well architected app will have its core state and logic decoupled from its view.

- Allows for running the core logic separate from the view. Optimize for its particular needs.
- Can swap out the view while maintaining the same state. Ie, 2D or 3D.
- Can run logic in a worker or on a web server.

We will use React as the view of choice but the following patterns can be used in any view framework.

### Renderer pattern

- Renderer component with useQuery mapping to a view component.
- View component draws the view.

### Run init with ref callback

- Show using a memoized ref callback to do initialization, like setting initial values on traits or adding traits on mount. Use return to undo it.

### Updating the view

- useTrait reactively updates when the value changes. Use this for rarely changing values.
- useTraitEffect lets you keep subscribe to the changes and not cause a rerender. This lets you optimize rerenders while keeping the view logic entirely in the view component.
- Recommended: Can add a Ref trait on init along with a system that queries for the Ref trait and batch updates it. The view system only starts running once the entity has had the Ref added meaning the view has run and is linked. This is clean, extensible and performant.
