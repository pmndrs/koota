[![Discord Shield](https://img.shields.io/discord/740090768164651008?style=flat&colorA=000000&colorB=000000&label=&logo=discord&logoColor=ffffff)](https://discord.gg/poimandres)

<img src="logo.svg" alt="Koota" width="100%" />

Koota is an ECS-based state management library optimized for real-time apps, games, and XR experiences. Use as much or as little as you need.

```bash
npm i koota
```
👉 [Try the starter template](https://github.com/Ctrlmonster/r3f-koota-starter)

### First, define traits

Traits are the building blocks of your state. They represent slices of data with specific meanings.

```js
import { trait } from 'koota';

// Basic trait with default values
const Position = trait({ x: 0, y: 0 });
const Velocity = trait({ x: 0, y: 0 });

// Trait with a callback for initial value
// ⚠️ Must be an object
const Mesh = trait(() => new THREE.Mesh());

// Tag trait (no data)
const IsActive = trait();
```

### Spawn entities

Entities are spawned in a world. By adding traits to an entity they gain content.

```js
import { createWorld } from 'koota';

const world = createWorld();

const player = world.spawn(Position, Velocity);
// Initial values can be passed in to the trait by using it as a function
const goblin = world.spawn(Position({ x: 10, y: 10 }), Velocity, Mesh);
```

### Query and update data

Queries fetch entities sharing traits (archetypes). Use them to batch update entities efficiently.

```js
// Run this in a loop
world.query(Position, Velocity).updateEach(([position, velocity]) => {
    position.x += velocity.x * delta;
    position.y += velocity.y * delta;
});
```

### Use in your React components

Traits can be used reactively inside of React components.

```js
import { WorldProvider, useQuery, useTrait } from 'koota/react'

// Wrap your app in WorldProvider
createRoot(document.getElementById('root')!).render(
    <WorldProvider world={world}>
        <App />
    </WorldProvider>
);

function RocketRenderer() {
    // Reactively update whenever the query updates with new entities
    const rockets = useQuery(Position, Velocity)
    return (
        <>
            {rockets.map((entity) => <RocketView key={entity} entity={entity} />)}
        </>
    )
}

function RocketView({ entity }) {
    // Observes this entity's position trait and reactively updates when it changes
    const position = useTrait(entity, Position)
    return (
        <div style={{ position: 'absolute', left: position.x ?? 0, top: position.y ?? 0 }}>
        🚀
        </div>
    )
}
```

### Modify Koota state safely with actions

Use actions to safely modify Koota from inside of React in either effects or events.

```js
import { createActions } from 'koota'
import { useActions } from 'koota/react';

const actions = createActions((world) => ({
    spawnShip: (position) => world.spawn(Position(position), Velocity),
    destroyAllShips: (world) => {
        world.query(Position, Velocity).forEach((entity) => {
            entity.destroy();
        });
    },
}));

function DoomButton() {
    const { spawnShip, destroyAllShips } = useActions(actions);

    // Spawn three ships on mount
    useEffect(() => {
        spawnShip({ x: 0, y: 1 });
        spawnShip({ x: 1, y: 0 });
        spawnShip({ x: 1, y: 1 });

        // Destroy all ships during cleanup
        return () => drestroyAllShips();
    }, []);

    // And destroy all ships on click!
    return <button onClick={destroyAllShips}>Boom!</button>;
}
```

Or access world directly and use it.

```js
const world = useWorld();

useEffect(() => {
    const entity = world.spawn(Velocity, Position);
    return () => entity.destroy();
});
```

## Advanced

### Relationships

Koota supports relationships between entities using the `relation` function. Relationships allow you to create connections between entities and query them efficiently.

```js
const ChildOf = relation();

const parent = world.spawn();
const child = world.spawn(ChildOf(parent));

const entity = world.queryFirst(ChildOf(parent)); // Returns child
```

#### With data

Relationships can contain data like any trait.

```js
const Contains = relation({ store: { amount: 0 } });

const inventory = world.spawn();
const gold = world.spawn();
inventory.add(Contains(gold));
inventory.set(Contains(gold), { amount: 10 });
```

#### Auto remove target

Relations can automatically remove target entities and their descendants.

```js
const ChildOf = relation({ autoRemoveTarget: true });

const parent = world.spawn();
const child = world.spawn(ChildOf(parent));
const grandchild = world.spawn(ChildOf(child));

parent.destroy();

world.has(child); // False, the child and grandchild are destroyed too
```

#### Exclusive Relationships

Exclusive relationships ensure each entity can only have one target.

```js
const Targeting = relation({ exclusive: true });

const hero = world.spawn();
const rat = world.spawn();
const goblin = world.spawn();

hero.add(Targeting(rat));
hero.add(Targeting(goblin));

hero.has(Targeting(rat)); // False
hero.has(Targeting(goblin)); // True
```

#### Querying relationships

Relationships can be queried with specific targets, wildcard targets using `*` and even inverted wildcard searches with `Wildcard` to get all entities with a relationship targeting another entity.

```js
const gold = world.spawn();
const silver = world.spawn();
const inventory = world.spawn(Contains(gold), Contains(silver));

const targets = inventory.targetsFor(Contains); // Returns [gold, silver]

const chest = world.spawn(Contains(gold));
const dwarf = world.spawn(Desires(gold));

const constainsSilver = world.query(Contains(silver)); // Returns [inventory]
const containsAnything = world.query(Contains('*')); // Returns [inventory, chest]
const relatesToGold = world.query(Wildcard(gold)); // Returns [inventory, chest, dwarf]
```

### Query modifiers

Modifiers are used to filter query results enabling powerful patterns. All modifiers can be mixed together.

#### Not

The `Not` modifier excludes entities that have specific traits from the query results.

```js
import { Not } from 'koota';

const staticEntities = world.query(Position, Not(Velocity));
```

#### Or

By default all query parameters are combined with logical AND. The `Or` modifier enables using logical OR instead.

```js
import { Or } from 'koota';

const movingOrVisible = world.query(Or(Velocity, Renderable));
```

#### Added

The `Added` modifier tracks all entities that have added the specified traits since the last time the query was run. A new instance of the modifier must be created for tracking to be unique.

```js
import { createAdded } from 'koota';

const Added = createAdded();

// This query will return entities that have just added the Position trait
const newPositions = world.query(Added(Position));

// After running the query, the Added modifier is reset
```

#### Removed

The `Removed` modifier tracks all entities that have removed the specified traits since the last time the query was run. This includes entities that have been destroyed. A new instance of the modifier must be created for tracking to be unique.

```js
import { createRemoved } from 'koota';

const Removed = createRemoved();

// This query will return entities that have just removed the Velocity trait
const stoppedEntities = world.query(Removed(Velocity));

// After running the query, the Removed modifier is reset
```

#### Changed

The `Changed` modifier tracks all entities that have had the specified traits values change since the last time the query was run. A new instance of the modifier must be created for tracking to be unique.

```js
import { createChanged } from 'koota';

const Changed = createChanged();

// This query will return entities whose Position has changed
const movedEntities = world.query(Changed(Position));

// After running the query, the Changed modifier is reset
```

### Add, remove and change events

Koota allows you to subscribe to add, remove, and change events for specific traits.

- `onAdd` triggers when `entity.add()` is called after the initial value has been set on the trait.
- `onRemove` triggers when `entity.remove()` is called, but before any data has been removed.
- `onChange` triggers when an entity's trait value has been set with `entity.set()` or when it is manually flagged with `entity.changed()`.

```js
// Subscribe to Position changes
const unsub = world.onChange(Position, (entity) => {
    console.log(`Entity ${entity} changed position`);
});

// Subscribe to Position additions
const unsub = world.onAdd(Position, (entity) => {
    console.log(`Entity ${entity} added position`);
});

// Subscribe to Position removals
const unsub = world.onRemove(Position, (entity) => {
    console.log(`Entity ${entity} removed position`);
});

// Trigger events
const entity = world.spawn(Position);
entity.set(Position, { x: 10, y: 20 });
entity.remove(Position);
```

### Query all entities

To get al queryable entities you simply query with not paramerters. Note, that not all entities are queryable. Any entity that has `IsExcluded` will not be able to be queried. This is used in Koota to exclude world entities, for example, but maybe used for other system level entities in the future. To get all entities regardless, use `world.entities`.

```js
// Returns all queryable entities
const allQueryableEntities = world.query()
```

### Change detection with `updateEach`

By default, `updateEach` will automatically turn on change detection for traits that are being tracked via `onChange` or the `Changed` modifier. If you want to silence change detection for a loop or force it to always run, you can do so with an options config.

```js
// Setting changeDetection to 'never' will silence it, triggering no change events
world.query(Position, Velocity).updateEach(([position, velocity]) => {
}, { changeDetection: 'never' });

// Setting changeDetection to 'always' will ignore selective tracking and always emit change events for all traits that are mutated
world.query(Position, Velocity).updateEach(([position, velocity]) => {
}, { changeDetection: 'always' });
```

### World traits

For global data like time, these can be traits added to the world. **World traits do not appear in queries.**

```js
const Time = trait({ delta: 0, current: 0 });
world.add(Time);

const time = world.get(Time);
world.set(Time, { current: performance.now() });
```

### Select traits on queries for updates
Query filters entity results and `select` is used to choose what traits are fetched for `updateEach` and `useStore`. This can be useful if your query is wider than the data you want to modify.

```js
// The query finds all entities with Position, Velocity and Mass
world.query(Position, Velocity, Mass)
  // And then select only Mass for updates
  .select(Mass)
  // Only mass will be used in the loop
  .updateEach([mass] => {
    // We are going blackhole
    mass.value += 1
  });
```

### Modifying trait stores direclty

For performance-critical operations, you can modify trait stores directly using the `useStore` hook. This approach bypasses some of the safety checks and event triggers, so use it with caution. All stores are structure of arrays for performance purposes.

```js
// Returns the SoA stores
world.query(Position, Velocity).useStore(([position, velocity], entities) => {
    // Write our own loop over the stores
    for (let i = 0; i < entities.length; i++) {
        // Get the entity ID to use as the array index
        const eid = entities[i].id();
        // Write to each array in the store
        position.x[eid] += velocity.x[eid] * delta;
        position.y[eid] += velocity.y[eid] * delta;
    }
});
```

### Caching queries

Inline queries are great for readability and are optimized to be as fast as possible, but there is still some small overhead in hashing the query each time it is called.

```js
// Every time this query runs a hash for the query parameters (Position, Velocity) 
// is created and then used to get the cached query internally
function updateMovement(world) {
  world.query(Position, Velocity).updateEach(([pos, vel]) => { })
}
```

While this is not likely to be a bottleneck in your code compared to the actual update function, if you want to save these CPU cycles you can cache the query ahead of time and use the returned key. This will have the additional effect of creating the internal query immediately on a worlds, otherwise it will get created the first time it is run.

```js
// The internal query is created immediately before it is invoked
const movementQuery = cacheQuery(Position, Velocity)

// They query key is hashed ahead of time and we just use it
function updateMovement(world) {
  world.query(movementQuery).updateEach(([pos, vel]) => { })
}
```

### Query tips for the curious

Performance and readability are often a tradeoff. The standard patterns are plenty fast, but if you are interested in diving deeper here are some quick tips.

#### Create update functions once

The standard pattern for `updateEach`, and handlers in general, uses an arrow function. This has great readability since the function logic is colocated with with query, but it comes at the cost of creating a new function for every entity being updated. This can be mitigated by creating the update function once in module scope.

```js
// Create the function once
const handleMove = ([position, velocity]) => { }

function updateMovement(world) {
  // Use it for the updateEach
  world.query(Position, Velocity).updateEach(handleMove)
}
```

#### You can use `for of` instead of `forEach` on query results

A query result is just an array of entities with some extra methods. This means you can use `for of` instead of `forEach` to get a nice iterator. Additionally, this will save a little performance since `forEach` calls a function on each member, while `for of` will compile down to what is basically a for loop.

```js
// This is nice and ergonomic but will cost some overhead since we are 
// creating a fresh function for each entity and then calling it
world.query().forEach((entity) => { })

// By contrast, this compiles down to a for loop and will have a 
// single block of code executed for each entity
for (const entity of world.query()) { }
```

## APIs in detail until I make docs

These are more like notes for docs. Take a look around, ask questions. Eventually this will become proper docs.

### World

This is where all data is stored. We have methods on entities but this is a bit of a trick, entities don't actually store any data and instead it is operating on the connected world. Each world has its own set of entities that do not overlap with another. Typically you only need one world.

Worlds can have traits, which is our version of a singleton. Use these for global resources like a clock. Each world gets its own entity used for world traits. This entity is not queryable but will show up in the list of active entities making the only way to retrieve a world trait with its API.

```js
// Spawns an entity
// Can pass any number of traits
// Return Entity
const entity = world.spawn()

// Checks if the world has the entity
// Return boolean
const result = world.has(entity)

// Get all entities that match the query parameters
// Return QueryResult (which is Entity[] with extras)
const entities = world.query(Position)

// Return the first entity that matches the query
// Return Entity
const entity = world.queryFirst(Position)

// The trait API is identical to entity's

// Add a trait to the world
world.add(Time)

// Remove a trait from the world
world.remove(Time)

// Check if the world has a trait
// Return boolean
const result = world.has(Time)

// Gets a snapshot instance of the trait
// Return TraitInstance
const time = world.get(Time)

// Sets the trait and triggers a change event
world.set(Time, { current: performance.now() })
// Can take a callback with the previous state passed in
world.set(Time, (prev) => ({
  current: performance.now(),
  delta: performance.now() - prev.current
}))

// Subscribe to add, remove or change events for entity traits
// Return unsub function
const unsub = world.onAdd(Position, (entity) => {})
const unsub = world.onRemove(Position, (entity) => {})
const unsub = world.onChange(Position, (entity) => {})

// Subscribe to add or remove query events
// This triggers whenever a query is updated
// Return unsub function
const unsub = world.onQueryAdd([Position, Velocity], (entity) => {})
const unsub = world.onQueryRemove([Position, Velocity], (entity) => {})

// An array of all entities alive in the world, including non-queryable entities
// This is a copy so editing it won't do anything!
// Entity[]
world.entities

// Returns the world's unique ID
// Return number
const id = world.id()

// Resets the world as if it were just created
// The world ID and reference is preserved
world.reset()

// Nukes the world and releases its ID
world.destroy()
```

### Entity

An entity is a number encoded with a world, generation and ID. Every entity is unique even if they have the same ID since they will have different generations. This makes automatic-recycling possible without reference errors. Because of this, the number of an entity won't give you its ID but will have to instead be decoded with `entity.id()`.

```js
// Add a trait to the entity
entity.add(Position) 

// Remove a trait from the entity
entity.remove(Position)

// Checks if the entity has the trait
// Return boolean
const result = entity.has(Position) 

// Gets a snapshot instance of the trait
// Return TraitInstance
const position = entity.get(Position)

// Sets the trait and triggers a change event
entity.set(Position, { x: 10, y: 10 })
// Can take a callback with the previous state passed in
entity.set(Position, (prev) => ({
  x: prev + 1,
  y: prev + 1
}))

// Get the targets for a relationship
// Return Entity[]
const targets = entity.targetsFor(Contains)

// Get the first target for a relationship
// Return Entity
const target = entity.targetFor(Contains)

// Get the entity ID
// Return number
const id = entity.id()

// Destroys the entity making its number no longer valid
entity.destroy()
```

### Trait

A trait is a specific block of data. They are added to entities to build up its overall data signature. If you are familiar with ECS, it is our version of a component. It is called a trait instead to not get confused with React or web components. 

A trait can be created with a schema that describes the kind of data it will hold. 

```js
const Position = trait({ x: 0, y: 0, z: 0 })
```

In cases where the data needs to be initialized for each instance of the trait created, a callback can be passed in to be used a as a lazy initializer.

```js
// ❌ The items array will be shared between every instance of this trait
const Inventory = trait({ 
  items: [], 
  max: 10, 
})

// ✅ With a lazy initializer, each instance will now get its own array
const Inventory = trait({ 
  items: () => [], 
  max: 10, 
})
```

Sometimes a trait only has one field that points to an object instance. In cases like this, it is useful to skip the schema and use a callback directly in the trait.

```js
const Velocity = trait(() => new THREE.Vector3())

// The returned state is simply the instance
const velocity = entity.get(Velocity)
```

Both schema-based and callback-based traits are used similarly, but they have different performance implications due to how their data is stored internally:

1. Schema-based traits use a Structure of Arrays (SoA) storage.
2. Callback-based traits use an Array of Structures (AoS) storage.

[Learn more about AoS and SoA here](https://en.wikipedia.org/wiki/AoS_and_SoA).

#### Structure of Arrays (SoA) - Schema-based traits

When using a schema, each property is stored in its own array. This can lead to better cache locality when accessing a single property across many entities. This is always the fastest option for data that has intensive operations.

```js
const Position = trait({ x: 0, y: 0, z: 0 });

// Internally, this creates a store structure like:
const store = {
  x: [0, 0, 0, ...], // Array for x values
  y: [0, 0, 0, ...], // Array for y values
  z: [0, 0, 0, ...], // Array for z values
};
```

#### Array of Structures (AoS) - Callback-based traits

When using a callback, each entity's trait data is stored as an object in an array. This is best used for compatibiilty with third party libraries like Three, or class instnaces in general.

```js
const Velocity = trait(() => ({ x: 0, y: 0, z: 0 }));

// Internally, this creates a store structure like:
const store = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  // ...
];

// Similarly, this will create a new instance of Mesh in each index
const Mesh = trait(() => new THREE.Mesh())
```

#### Typing traits

Traits can have a schema type passed into its generic. This can be useful if the inferred type is not good enough.

```js
type AttackerSchema = {
  continueCombo: boolean | null,
  currentStageIndex: number | null,
  stages: Array<AttackStage> | null,
  startedAt: number | null,
}

const Attacker = trait<AttackerSchema>({
  continueCombo: null,
  currentStageIndex: null,
  stages: null,
  startedAt: null,
})
```

However, this will not work with interfaces without a workaround due to intended behavior in TypeScript: https://github.com/microsoft/TypeScript/issues/15300
Interfaces can be used with `Pick` to convert the key signatures into something our type code can understand.

```js
interface AttackerSchema {
  continueCombo: boolean | null,
  currentStageIndex: number | null,
  stages: Array<AttackStage> | null,
  startedAt: number | null,
}

// Pick is required to not get type errors
const Attacker = trait<Pick<AttackerSchema, keyof AttackerSchema>>({
  continueCombo: null,
  currentStageIndex: null,
  stages: null,
  startedAt: null,
})
```


### React

### `useQuery` 

Reactively updates when entities matching the query changes. Returns a `QueryResult`, which is like an array of entities.

```js
// Get all entities with Position and Velocity traits
const entities = useQuery(Position, Velocity);

// Render a view
return (
  <>
    {entities.map(entity => <View key={entity.id()} entity={entity} />)}
  </>
);
```

### `usQueryFirst` 

Works like `useQuery` but only returns the first result. Can either be an entity of undefined.

```js
// Get the first entity with Player and Position traits
const player = useQueryFirst(Player, Position);

// Render a view if an entity is found
return player ? (
  <View entity={player} />
) : null;

```

### `useWorld` 

Returns the world held in context via `WorldProvider`.

```js
// Get the default world
const world = useWorld();

// Use the world to create an entity on mount
useEffect(() => {
    const entity = world.spawn()
    return => entity.destroy()
}, [])

```

### `WorldProvider` 

The provider for the world context. A world must be created and passed in.

```js
// Create a world and pass it to the provider
const world = createWorld();

// All hooks will now use this world instead of the default
function App() {
  return (
    <WorldProvider world={world}>
      <Game />
    </WorldProvider>
  );
}

```

### `useTrait` 

Observes an entity, or world, for a given trait and reactively updates when it is added, removed or changes value. The returned trait snapshot maybe `undefined` if the trait is no longer on the target. This can be used to conditionally render.

```js
// Get the position trait from an entity and reactively updates when it changes
const position = useTrait(entity, Position);

// If position is removed from entity then it will be undefined
if (!position) return null

// Render the position
return (
  <div>
    Position: {position.x}, {position.y}
  </div>
);
```

The entity passed into `useTrait` can be `undefined` or `null`. This helps with situations where `useTrait` is combined with queries in the same component since hooks cannot be conditionally called. However, this means that result can be `undefined` if the trait is not on the entity or if the target is itself `undefined`. In most cases the distinction will not matter, but if it does you can disambiguate by testing the target.

```js
// The entity may be undefined if there is no valid result
const entity = useQueryFirst(Position, Velocity)
// useTrait handles this by returned undefined if the target passed in does not exist
const position = useTrait(entity, Position);

// However, undefined here can mean no entity or no component on entity
// To make the outcome no longer ambiguous you have to test the entity
if (!entity) return <div>No entity found!</div>

// Now this is narrowed to Position no longer being on the component
if (!position) return null

return (
  <div>
    Position: {position.x}, {position.y}
  </div>
);
```

### `useTraitEffect` 

Subscribes a callback to a trait on an entity. This callback fires as an effect whenenver it is added, removed or changes value without rerendering.

```js
// Subscribe to position changes on an entity and update a ref without causing a rerender
useTraitEffect(entity, Position, (position) => {
  if (!position) return;
  meshRef.current.position.copy(position);
});

// Subscribe to world-level traits
useTraitEffect(world, GameState, (state) => {
  if (!state) return;
  console.log('Game state changed:', state);
});

```

### `useActions` 

Returns actions bound to the world that is context. Use actions created by `createActions`.

```js
// Create actions
const actions = createActions((world) => ({
    spawnPlayer: () => world.spawn(IsPlayer).
    destroyAllPlayers: () => {
        world.query(IsPlayer).forEach((player) => {
            player.destroy()
        })
    }
}))

// Get actions bound to the world in context
const { spawnPlayer, destroyAllPlayers } = useActions();

// Call actions to modify the world in an effect or handlers
useEffect(() => {
    spawnPlayer()
    return () => destroyAllPlayers()
}, [])
```
