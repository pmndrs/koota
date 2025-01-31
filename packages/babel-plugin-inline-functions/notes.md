I wanted to try replacing traitData with a two dimensional array, but it appears it would make the cost of the `has` call to increase which is currently called quite a bit.

Let's investigate this further.

Loks like this could indeed work out. I think let's do the inlining first and then look at optimizing this data access.

Though it is uncertain how much any of this matters lol.

```js
function hasTrait(world: World, entity: Entity, trait: Trait): boolean {
	const ctx = world[$internal];
	const data = ctx.traitData.get(trait);
	if (!data) return false;

	const { generationId, bitflag } = data;
	const eid = getEntityId(entity);
	const mask = ctx.entityMasks[generationId][eid];

    if (!mask) return false

	return (mask & bitflag) === bitflag;
}

let result

const ctx = world[$internal];
const data = ctx.traitData.get(trait);

if (!data) {
    result = false
} else {
    const { generationId, bitflag } = data;
    const eid = getEntityId(entity);
    const mask = ctx.entityMasks[generationId][eid];

    if (!mask) {
        result = false
    } else {
        result = (mask & bitflag) === bitflag;   
    }
}

const something = result
```

```js
function get(this: Entity, trait: Trait) {
    const world = getWorld(this);
	if (!hasTrait(world, this, trait)) return undefined;
	return traitCtx.get(getEntityId(this), getStore(world, trait));
}
```

```js
function get(this: Entity, trait: Trait) {
    // inline getWorld
    // which inlines getEntityWorldId
    const worldId = entity >>> WORLD_ID_SHIFT
	const world =  universe.worlds[worldId];
    // inline hasTrait
    let hasTrait_result
    const hasTrait__ctx = world[$internal];
	const hasTrait__data = hasTrait__ctx.traitData.get(trait);

    // Inline the control flow -- right now this is just if statements
	if (!hasTrait__data) {
        hasTrait_result = false
    } else {
        const { generationId, bitflag } = hasTrait__data;
        const eid = this & ENTITY_ID_MASK
        const mask = hasTrait__ctx.entityMasks[generationId][eid];
        hasTrait_result = (mask & bitflag) === bitflag;
    }

	if (!hasTrait_result) return undefined;

    // inline getEntityId
    const getEntityId_result = this & ENTITY_ID_MASK
    
    // inline getStore
    const getStore_ctx = world[$internal];
	const getStore_data = getStore_ctx.traitData.get(trait);
	const getStore_store = getStore_data.store;
	const getStore_result = getStore_store

	return traitCtx.get(getEntityId_result, getStore_result);
}
```

This expansion shows some redundancy. So the next step would be to get rid of the redundancy. We use the same `ctx` and `data` lookup now. I assume we can do this by inspecting the value assignment on a final pass. We need to do accross scopes too and assign at the highest scope, rearranging assignment to the top in such cases.

```js
function get(this: Entity, trait: Trait) {
    // inline getWorld
    // which inlines getEntityWorldId
    const worldId = entity >>> WORLD_ID_SHIFT
	const world =  universe.worlds[worldId];
    // inline hasTrait
    let hasTrait_result
    const ctx = world[$internal];
	const data = hasTrait__ctx.traitData.get(trait);

    // Move eid assignment up top and reuse accross scopes
    const eid = this & ENTITY_ID_MASK

	if (!hasTrait__data) {
        hasTrait_result = false
    } else {
        const { generationId, bitflag } = hasTrait__data;
        const mask = hasTrait__ctx.entityMasks[generationId][eid];
        hasTrait_result = (mask & bitflag) === bitflag;
    }

	if (!hasTrait_result) return undefined;
    
    // inline getStore
	const getStore_store = data.store;
	const getStore_result = getStore_store

	return traitCtx.get(eid, getStore_result);
}
```

A final optimization would be to reduce assignments, though I don't know how much that matters.

```js
function get(this: Entity, trait: Trait) {
    // inline getWorld
    // which inlines getEntityWorldId
	const world =  universe.worlds[entity >>> WORLD_ID_SHIFT];
    // inline hasTrait
    let hasTrait_result
    const ctx = world[$internal];
	const data = hasTrait__ctx.traitData.get(trait);
    const eid = this & ENTITY_ID_MASK

	if (!hasTrait__data) {
        hasTrait_result = false
    } else {
        const mask = hasTrait__ctx.entityMasks[hasTrait__data.generationId][eid];
        hasTrait_result = (mask & hasTrait__data.bitflag) === hasTrait__data.bitflag;
    }

	if (!hasTrait_result) return undefined;

    // inline getEntityId
    // inline getStore
	return traitCtx.get(eid, data.store);
}
```

Instead of automatically deduping variables, we will have a `@pure` annotation. The dev then determines if the function is pure and if all functions in the transformed function are pure, we can safely dedup.

```js
export /* @inline @pure */ function hasTrait(world: World, entity: Entity, trait: Trait): boolean {
	const ctx =world[$internal];
	const data = ctx.traitData.get(trait);
	if (!data) return false;

	const { generationId, bitflag } = data;
	const eid = getEntityId(entity);
	const mask = ctx.entityMasks[generationId][eid];

	return (mask & bitflag) === bitflag;
}

export /* @pure */ function getStore<C extends Trait = Trait>(world: World, trait: C): ExtractStore<C> {
	const ctx = world[$internal];
	const data = ctx.traitData.get(trait)!;
	const store = data.store as ExtractStore<C>;

	return store;
}
```