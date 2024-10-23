# Koota

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
const Mesh = trait(() => THREE.Mesh());

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
import { WorldProvider, useQuery, useObserve } from 'koota/react'

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
            {rockets.map((entity) => <Rocket key={entity} entity={entity} />)}
        </>
    )
}

function Rocket({ entity }) {
    // Observes this entity's position trait and reactively updates when it changes
    const position = useObserve(entity, Position)
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
import { createActions } from 'koota/react';

const useMyActions = createActions((world) => ({
    spawnShip: (position) => world.spawn(Position(position), Velocity),
    destroyAllShips: (world) => {
        world.query(Position, Velocity).forEach((entity) => {
            entity.destroy();
        });
    },
}));

function DoomButton() {
    const { spawnShip, destroyAllShips } = useMyActions();

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
const relatesToGold = world.query(Widlcard(gold)); // Returns [inventory, chest, dwarf]
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

### World traits

For global data like time, these can be traits added to the world. **World traits do not appear in queries.**

```js
const Time = trait({ delta: 0, current: 0 });
world.add(Time);

const time = world.get(Time);
world.set(Time, { current: performance.now() });
```

### Select traits on queries for updates
Query filters entity results and `select` is used to choose what traits are fetched for `updateEach` and `useStore`.

```js
// Add example when I get the energy
```

### Modifying trait stores direclty

For performance-critical operations, you can modify trait stores directly using the useStore hook. This approach bypasses some of the safety checks and event triggers, so use it with caution. All stores are structure of arrays for performance purposes.

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

## APIs in detail until I make docs

These are more like notes for docs. Take a look around, ask questions. Eventually this will become proper docs.

### World

This is where all data is stored. We have methods on entities but this is a bit of a trick, entities don't actually store any data and instead it is operating on the connected world. Each world has its own set of entities that do not overlap with another. Typically you only need one world.

Worlds can have traits, which is our version of a singleton. Use these for global resources like a clock. Each world gets its own entity used for world traits. This entity is no queryable but will show up in the list of active entities making the only way to retrieve a world trait with its API.

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

// Subscribe to add, remove or change events for a set of query parameters
// Anything you can put in a query is legal
// Return unsub function
const unsub = world.onAdd([Position], (entity) => {})
const unsub = world.onRemove([Position], (entity) => {})
const unsub = world.onChange([Position], (entity) => {})

// An array of all entities alive in the world
// This is a copy so editing it won't do anything!
// Entity[]
world.entities

// Returns the world's unique ID
// Return number
const id = world.id()

// Resets the world as if it were just created
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
const result = enttiy.has(Position) 

// Gets a snapshot instance of the trait
// Return TraitInstance
const position = entity.get(Position)

// Sets the trait and triggers a change event
entity.set(Position, { x: 10, y: 10 })

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

A trait defines a kind of data. If you are familiar with ECS, it is our version of a component. We call it a trait instead to not get confused with React or web components. From a high level, you just create traits either with a schema or with a callback returning an object.

```js
// A schema
const Position = trait({ x: 0, y: 0, z: 0 })

// A callback
const Velocity = trait(() => THREE.Vector3())
```

Both schema-based and callback-based traits are used similarly, but they have different performance implications due to how their data is stored internally:

1. Schema-based traits use a Structure of Arrays (SoA) storage.
2. Callback-based traits use an Array of Structures (AoS) storage.

[Learn more about AoS and SoA here](https://en.wikipedia.org/wiki/AoS_and_SoA).

### Structure of Arrays (SoA) - Schema-based traits

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

### Array of Structures (AoS) - Callback-based traits

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
const Mesh = trait(() => THREE.Mesh())
```

### React

`useEntityRef` is a safe way to spawn an entity per React primitive and add traits. It is usually used for adding traits that capture the ref to the entity. The entity will be stable for the lifetime of the React component, except in cases like HMR.

```js
const Ref = trait({ value: null! })

function Rocket() {
    const entityRef = useEntityRef((node, entity) => {
        entity.add(Ref({ value: node }))
    })

    return <div ref={entityRef}>🚀</div>
}
```
