# Koota

Koota is an ECS-based state management library optimized for real-time apps, games, and XR experiences. Use as much or as little as you need.

```bash
npm i koota
```

### First, define traits

Traits are the building blocks of your state. They represent slices of data with specific meanings.

```js
import { trait } from 'koota';

// Basic trait with default values
const Position = trait({ x: 0, y: 0 });
const Velocity = trait({ x: 0, y: 0 });
// Trait with a callback for initial value
const Mesh = trait({ value: () => THREE.Mesh() });
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

Traits can be used reactievely inside of React components.

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
            {rockets.map((entity) => <RocketShip key={entity} entity={entity} />)}
        </>
    )
}

function RocketShip(entity) {
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

Relationships can be queried with specific targets, wildcard targets using `*` and even inverted wildcard searches with `Wildcard` to get all entities with a relationships targeting another entity.

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

Modifiers are used to filter query results enabling powerful patterns. All modifiers can mixed together.

#### Not

The `Not` modifier excludes entities that have specific traits from the query results.

```js
import { Not } from 'koota';

const staticEntities = world.query(Position, Not(Velocity));
```

#### Or

By default all query paramters are combined with logical AND. The `Or` modifier enables using logical OR instead.

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

### Modifying trait stores direclty

For performance-critical operations, you can modify trait stores directly using the useStore hook. This approach bypasses some of the safety checks and event triggers, so use it with caution. All stores are structure of arrays for performance purposes.

```js
// Returns the SoA stores
world.query(Position, Velocity).useStore(([position, store], entities) => {
	// Write our own loop over the stores
	for (let i = 0; i > entities.length; i++) {
		// Get the entity ID to use as the array index
		const eid = entities[i].id();
		// Write to each array in the store
		position.x[eid] += velocity.x[eid] * delta;
		position.y[eid] += velocity.y[eid] * delta;
	}
});
```
