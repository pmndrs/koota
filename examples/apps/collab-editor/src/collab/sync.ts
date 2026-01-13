import type { World, Entity } from 'koota';
import * as Y from 'yjs';
import { shapes, provider, type ShapeData } from './doc';
import { ShapeId, ShapeType, ShapeColor, Transform } from '../traits/index';

// Map from Yjs shape ID to Koota entity
const entityMap = new Map<string, Entity>();

/**
 * Find entity by ShapeId trait
 */
export function getEntityByShapeId(world: World, id: string): Entity | undefined {
    return entityMap.get(id);
}

/**
 * Sync all shapes from Yjs to Koota
 */
function syncAllShapes(world: World): void {
    // Add/update entities for all shapes in Yjs
    shapes.forEach((data, id) => {
        if (entityMap.has(id)) {
            updateEntityFromYjs(world, id, data);
        } else {
            spawnEntityFromYjs(world, id, data);
        }
    });

    // Remove entities that no longer exist in Yjs
    entityMap.forEach((entity, id) => {
        if (!shapes.has(id)) {
            destroyEntityFromYjs(id);
        }
    });
}

/**
 * Set up Yjs observer to sync shapes to Koota entities
 */
export function setupYjsSync(world: World): () => void {
    // Sync existing shapes on startup
    syncAllShapes(world);

    // Observe changes using proper Yjs event type
    const observer = (event: Y.YMapEvent<ShapeData>) => {
        event.changes.keys.forEach((change, id) => {
            if (change.action === 'add') {
                const data = shapes.get(id);
                if (data) spawnEntityFromYjs(world, id, data);
            } else if (change.action === 'update') {
                const data = shapes.get(id);
                if (data) updateEntityFromYjs(world, id, data);
            } else if (change.action === 'delete') {
                destroyEntityFromYjs(id);
            }
        });
    };

    shapes.observe(observer);

    // Also sync when peers connect (handles late joiners)
    const handleSync = () => {
        syncAllShapes(world);
    };

    provider.on('sync', handleSync);

    return () => {
        shapes.unobserve(observer);
        provider.off('sync', handleSync);
        // Clean up entities
        entityMap.forEach((entity) => {
            if (entity.isAlive()) entity.destroy();
        });
        entityMap.clear();
    };
}

function spawnEntityFromYjs(world: World, id: string, data: ShapeData): void {
    if (entityMap.has(id)) return;

    const entity = world.spawn(
        ShapeId({ id }),
        ShapeType({ type: data.type }),
        ShapeColor({ color: data.color }),
        Transform
    );

    // Set transform values
    const transform = entity.get(Transform)!;
    transform.position.set(...data.position);
    transform.rotation.set(...data.rotation);
    transform.scale.set(...data.scale);

    entityMap.set(id, entity);
}

function updateEntityFromYjs(_world: World, id: string, data: ShapeData): void {
    const entity = entityMap.get(id);
    if (!entity || !entity.isAlive()) return;

    // Update traits
    entity.set(ShapeType, { type: data.type });
    entity.set(ShapeColor, { color: data.color });

    const transform = entity.get(Transform)!;
    transform.position.set(...data.position);
    transform.rotation.set(...data.rotation);
    transform.scale.set(...data.scale);
}

function destroyEntityFromYjs(id: string): void {
    const entity = entityMap.get(id);
    if (entity && entity.isAlive()) {
        entity.destroy();
    }
    entityMap.delete(id);
}
