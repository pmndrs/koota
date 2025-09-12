import { Entity } from "../../entity/types";
import { World } from "../../world/world";
import { Key } from "../trait";

export type KeyMap = Map<string, Entity>

export const registerKeyMap = (world:World): KeyMap => {
    const keyMap:KeyMap = new Map()
    // inverse map (avoid O(n) scans when going the other way)
    /// note this is really only useful in the "changed" case
    /// as otherwise an Entity can just get its Key trait
    const entityMap: Map<Entity, string> = new Map()

    const add = (keyTrait:typeof Key, entity: Entity) => {
        const key = entity.get(keyTrait) as string
        if (keyMap.has(key)){
            console.warn(`Duplicate Key ${key} on Entity ${entity}`)
            // what to actually do here?
            entity.remove(keyTrait)
            return
        }
        keyMap.set(key, entity)
        entityMap.set(entity, key)
    };

    const remove = (keyTrait: typeof Key, entity: Entity) => {
        if (entityMap.has(entity)) {
            const key = entityMap.get(entity)!;
            keyMap.delete(key);
            entityMap.delete(entity);
        }
    };

    const change = (keyTrait: typeof Key, entity: Entity) => {
        const oldKey = entityMap.get(entity);
        if (oldKey) {
            keyMap.delete(oldKey);
        }
        add(keyTrait, entity)
    };

    world.onAdd(Key, (entity) => {
        add(Key, entity)
    })

    world.onRemove(Key, (entity) => {
        remove(Key, entity)
    })

    world.onChange(Key, (entity) => {
        change(Key, entity)
    })
    // need to implement dual clear()
    // this is probably(?) not the right thing to return
    /// should be more clear on cleanup/gc within this closure
    return keyMap
};