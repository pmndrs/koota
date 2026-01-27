import { createActions, type Entity } from 'koota';
import {
    User,
    ClientId,
    IsLocal,
    IsRemote,
    RemoteCursor,
    RemoteSelection,
    RemotelyTransformedBy,
    History,
} from '../traits';
import type { EphemeralTransform } from '../multiplayer/protocol';
import { createRandomUserName } from '../utils/user-name';

export const presenceActions = createActions((world) => {
    const createUser = (
        clientIdValue: string,
        options?: { kind: 'local' | 'remote'; name?: string }
    ) => {
        const kind = options?.kind ?? 'remote';
        const name = options?.name ?? createRandomUserName();

        const entity = world.spawn(User, ClientId, kind === 'local' ? IsLocal : IsRemote);
        entity.set(ClientId, { id: clientIdValue });
        entity.set(User, { name });
        return entity;
    };

    return {
        createUser,

        removeUser: (entity: Entity) => {
            entity.destroy();
        },

        updateRemoteCursor: (userEntity: Entity, cursor: { x: number; y: number } | null) => {
            if (cursor) {
                if (userEntity.has(RemoteCursor)) {
                    // Update target, keep current for interpolation
                    const current = userEntity.get(RemoteCursor)!;
                    userEntity.set(RemoteCursor, {
                        ...current,
                        targetX: cursor.x,
                        targetY: cursor.y,
                    });
                } else {
                    // New cursor - initialize at target
                    userEntity.add(RemoteCursor);
                    userEntity.set(RemoteCursor, {
                        x: cursor.x,
                        y: cursor.y,
                        targetX: cursor.x,
                        targetY: cursor.y,
                    });
                }
            } else {
                userEntity.remove(RemoteCursor);
            }
        },

        updateRemoteSelection: (userEntity: Entity, selection: number[]) => {
            if (selection.length > 0) {
                if (!userEntity.has(RemoteSelection)) {
                    userEntity.add(RemoteSelection);
                }
                userEntity.set(RemoteSelection, selection);
            } else {
                userEntity.remove(RemoteSelection);
            }
        },

        updateRemoteTransform: (userEntity: Entity, transform: EphemeralTransform) => {
            const history = world.get(History);
            if (!history) return;

            // If transform is null, clear any existing transform from this user
            if (!transform) {
                for (const [, shapeEntity] of history.entities) {
                    if (shapeEntity.has(RemotelyTransformedBy(userEntity))) {
                        shapeEntity.remove(RemotelyTransformedBy(userEntity));
                    }
                }
                return;
            }

            // Find the shape entity by stable ID
            const shapeEntity = history.entities.get(transform.shapeId);
            if (!shapeEntity) return;

            // Check if this user was transforming a different shape before
            for (const [id, entity] of history.entities) {
                if (id !== transform.shapeId && entity.has(RemotelyTransformedBy(userEntity))) {
                    entity.remove(RemotelyTransformedBy(userEntity));
                }
            }

            // Update or add the relation with target values for interpolation
            if (shapeEntity.has(RemotelyTransformedBy(userEntity))) {
                const current = shapeEntity.get(RemotelyTransformedBy(userEntity))!;
                shapeEntity.set(RemotelyTransformedBy(userEntity), {
                    ...current,
                    targetDeltaX: transform.deltaX,
                    targetDeltaY: transform.deltaY,
                    targetScaleX: transform.scaleX,
                    targetScaleY: transform.scaleY,
                    targetRotation: transform.rotation,
                });
            } else {
                // New transform - initialize current at target (no lag on first frame)
                shapeEntity.add(
                    RemotelyTransformedBy(userEntity, {
                        deltaX: transform.deltaX,
                        deltaY: transform.deltaY,
                        scaleX: transform.scaleX,
                        scaleY: transform.scaleY,
                        rotation: transform.rotation,
                        targetDeltaX: transform.deltaX,
                        targetDeltaY: transform.deltaY,
                        targetScaleX: transform.scaleX,
                        targetScaleY: transform.scaleY,
                        targetRotation: transform.rotation,
                    })
                );
            }
        },
    };
});
