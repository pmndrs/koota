import { createActions, type Entity } from 'koota';
import {
    User,
    ClientId,
    IsLocal,
    IsRemote,
    RemoteCursor,
    RemoteSelection,
    History,
    Position,
    Rotation,
    Scale,
    Color,
    EditingPosition,
    EditingRotation,
    EditingScale,
    EditingColor,
    EditedBy,
} from '../traits';
import type { EditStart, EditUpdate, EditEnd } from '../multiplayer/protocol';
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

        // Handle edit start from remote user - new unified model
        handleRemoteEditStart: (userEntity: Entity, data: EditStart) => {
            const history = world.get(History);
            if (!history) return;

            const shapeEntity = history.entities.get(data.shapeId);
            if (!shapeEntity) return;

            // Add editing traits with durable values
            if (
                data.properties.includes('position') &&
                data.durableX !== undefined &&
                !shapeEntity.has(EditingPosition)
            ) {
                shapeEntity.add(
                    EditingPosition({ durableX: data.durableX, durableY: data.durableY! })
                );
            }
            if (
                data.properties.includes('rotation') &&
                data.durableAngle !== undefined &&
                !shapeEntity.has(EditingRotation)
            ) {
                shapeEntity.add(EditingRotation({ durableAngle: data.durableAngle }));
            }
            if (
                data.properties.includes('scale') &&
                data.durableScaleX !== undefined &&
                !shapeEntity.has(EditingScale)
            ) {
                shapeEntity.add(
                    EditingScale({ durableX: data.durableScaleX, durableY: data.durableScaleY! })
                );
            }
            if (
                data.properties.includes('color') &&
                data.durableFill !== undefined &&
                !shapeEntity.has(EditingColor)
            ) {
                shapeEntity.add(EditingColor({ durableFill: data.durableFill }));
            }

            // Track editor
            shapeEntity.add(EditedBy(userEntity));
        },

        // Handle edit update from remote user - updates Position/Rotation/Scale/Color directly
        handleRemoteEditUpdate: (data: EditUpdate) => {
            const history = world.get(History);
            if (!history) return;

            const shapeEntity = history.entities.get(data.shapeId);
            if (!shapeEntity) return;

            // Update traits directly with absolute values
            if (data.x !== undefined && data.y !== undefined) {
                shapeEntity.set(Position, { x: data.x, y: data.y });
            }
            if (data.angle !== undefined) {
                shapeEntity.set(Rotation, { angle: data.angle });
            }
            if (data.scaleX !== undefined && data.scaleY !== undefined) {
                shapeEntity.set(Scale, { x: data.scaleX, y: data.scaleY });
            }
            if (data.fill !== undefined) {
                shapeEntity.set(Color, { fill: data.fill });
            }
        },

        // Handle edit end from remote user
        handleRemoteEditEnd: (userEntity: Entity, data: EditEnd) => {
            const history = world.get(History);
            if (!history) return;

            const shapeEntity = history.entities.get(data.shapeId);
            if (!shapeEntity) return;

            if (!data.committed) {
                // Restore from durable values
                const editPos = shapeEntity.get(EditingPosition);
                if (editPos) {
                    shapeEntity.set(Position, { x: editPos.durableX, y: editPos.durableY });
                }
                const editRot = shapeEntity.get(EditingRotation);
                if (editRot) {
                    shapeEntity.set(Rotation, { angle: editRot.durableAngle });
                }
                const editScale = shapeEntity.get(EditingScale);
                if (editScale) {
                    shapeEntity.set(Scale, { x: editScale.durableX, y: editScale.durableY });
                }
                const editColor = shapeEntity.get(EditingColor);
                if (editColor) {
                    shapeEntity.set(Color, { fill: editColor.durableFill });
                }
            }

            // Remove editor
            shapeEntity.remove(EditedBy(userEntity));

            // Clean up editing state only if no editors remain
            if (shapeEntity.targetsFor(EditedBy).length === 0) {
                shapeEntity.remove(EditingPosition);
                shapeEntity.remove(EditingRotation);
                shapeEntity.remove(EditingScale);
                shapeEntity.remove(EditingColor);
            }
        },
    };
});
