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
    EditingPosition,
    EditingRotation,
    EditingScale,
    EditedBy,
    IsRemoteDragging,
    EDITING_TRAITS,
} from '../traits';
import type { EditStart, EditUpdate, EditEnd } from '../multiplayer/protocol';
import { createRandomUserName } from '../utils/user-name';
import { getActiveByStableId } from '../utils/shape-helpers';

// Editing trait configs for remote edits

export const presenceActions = createActions((world) => {
    const getShapeEntity = (shapeId: number) => {
        const history = world.get(History);
        return history ? getActiveByStableId(history, shapeId) : null;
    };

    return {
        createUser: (
            clientIdValue: string,
            options?: { kind: 'local' | 'remote'; name?: string }
        ) => {
            const kind = options?.kind ?? 'remote';
            const name = options?.name ?? createRandomUserName();
            const entity = world.spawn(User, ClientId, kind === 'local' ? IsLocal : IsRemote);
            entity.set(ClientId, { id: clientIdValue });
            entity.set(User, { name });
            return entity;
        },

        removeUser: (entity: Entity) => entity.destroy(),

        updateRemoteCursor: (userEntity: Entity, cursor: { x: number; y: number } | null) => {
            if (!cursor) {
                userEntity.remove(RemoteCursor);
                return;
            }
            if (userEntity.has(RemoteCursor)) {
                const current = userEntity.get(RemoteCursor)!;
                userEntity.set(RemoteCursor, { ...current, targetX: cursor.x, targetY: cursor.y });
            } else {
                userEntity.add(RemoteCursor);
                userEntity.set(RemoteCursor, {
                    x: cursor.x,
                    y: cursor.y,
                    targetX: cursor.x,
                    targetY: cursor.y,
                });
            }
        },

        updateRemoteSelection: (userEntity: Entity, selection: number[]) => {
            if (selection.length === 0) {
                userEntity.remove(RemoteSelection);
            } else {
                if (!userEntity.has(RemoteSelection)) userEntity.add(RemoteSelection);
                userEntity.set(RemoteSelection, selection);
            }
        },

        handleRemoteEditStart: (userEntity: Entity, data: EditStart) => {
            const shapeEntity = getShapeEntity(data.shapeId);
            if (!shapeEntity) return;

            const isDrag = data.mode === 'drag';

            // Add editing traits based on which properties are being edited
            if (data.properties.includes('position') && data.durableX !== undefined) {
                if (!shapeEntity.has(EditingPosition)) {
                    const pos = shapeEntity.get(Position);
                    shapeEntity.add(
                        EditingPosition({
                            durableX: data.durableX,
                            durableY: data.durableY!,
                            targetX: pos?.x ?? data.durableX,
                            targetY: pos?.y ?? data.durableY!,
                        })
                    );
                }
            }
            if (data.properties.includes('rotation') && data.durableAngle !== undefined) {
                if (!shapeEntity.has(EditingRotation)) {
                    const rot = shapeEntity.get(Rotation);
                    shapeEntity.add(
                        EditingRotation({
                            durableAngle: data.durableAngle,
                            targetAngle: rot?.angle ?? data.durableAngle,
                        })
                    );
                }
            }
            if (data.properties.includes('scale') && data.durableScaleX !== undefined) {
                if (!shapeEntity.has(EditingScale)) {
                    const scale = shapeEntity.get(Scale);
                    shapeEntity.add(
                        EditingScale({
                            durableX: data.durableScaleX,
                            durableY: data.durableScaleY!,
                            targetX: scale?.x ?? data.durableScaleX,
                            targetY: scale?.y ?? data.durableScaleY!,
                        })
                    );
                }
            }
            // Color is commit-only - no remote editing state needed

            if (isDrag && !shapeEntity.has(IsRemoteDragging)) {
                shapeEntity.add(IsRemoteDragging);
            }
            shapeEntity.add(EditedBy(userEntity));
        },

        handleRemoteEditUpdate: (data: EditUpdate) => {
            const shapeEntity = getShapeEntity(data.shapeId);
            if (!shapeEntity) return;

            const isDrag = shapeEntity.has(IsRemoteDragging);

            // Position update
            if (data.x !== undefined && data.y !== undefined) {
                if (isDrag) {
                    const editing = shapeEntity.get(EditingPosition);
                    if (editing) {
                        shapeEntity.set(EditingPosition, {
                            ...editing,
                            targetX: data.x,
                            targetY: data.y,
                        });
                    }
                } else {
                    shapeEntity.set(Position, { x: data.x, y: data.y });
                }
            }

            // Rotation update
            if (data.angle !== undefined) {
                if (isDrag) {
                    const editing = shapeEntity.get(EditingRotation);
                    if (editing) {
                        shapeEntity.set(EditingRotation, { ...editing, targetAngle: data.angle });
                    }
                } else {
                    shapeEntity.set(Rotation, { angle: data.angle });
                }
            }

            // Scale update
            if (data.scaleX !== undefined && data.scaleY !== undefined) {
                if (isDrag) {
                    const editing = shapeEntity.get(EditingScale);
                    if (editing) {
                        shapeEntity.set(EditingScale, {
                            ...editing,
                            targetX: data.scaleX,
                            targetY: data.scaleY,
                        });
                    }
                } else {
                    shapeEntity.set(Scale, { x: data.scaleX, y: data.scaleY });
                }
            }

            // Color is commit-only - ignore remote ephemeral color updates
        },

        handleRemoteEditEnd: (userEntity: Entity, data: EditEnd) => {
            const shapeEntity = getShapeEntity(data.shapeId);
            if (!shapeEntity) return;

            // Restore or snap based on committed state
            if (!data.committed) {
                // Restore to durable values
                const editPos = shapeEntity.get(EditingPosition);
                if (editPos) shapeEntity.set(Position, { x: editPos.durableX, y: editPos.durableY });

                const editRot = shapeEntity.get(EditingRotation);
                if (editRot) shapeEntity.set(Rotation, { angle: editRot.durableAngle });

                const editScale = shapeEntity.get(EditingScale);
                if (editScale)
                    shapeEntity.set(Scale, { x: editScale.durableX, y: editScale.durableY });

                // Color is commit-only - no restore needed
            } else if (shapeEntity.has(IsRemoteDragging)) {
                // Snap to final target values
                const editPos = shapeEntity.get(EditingPosition);
                if (editPos) shapeEntity.set(Position, { x: editPos.targetX, y: editPos.targetY });

                const editRot = shapeEntity.get(EditingRotation);
                if (editRot) shapeEntity.set(Rotation, { angle: editRot.targetAngle });

                const editScale = shapeEntity.get(EditingScale);
                if (editScale) shapeEntity.set(Scale, { x: editScale.targetX, y: editScale.targetY });
            }

            shapeEntity.remove(EditedBy(userEntity));

            // Clean up if no editors remain
            if (shapeEntity.targetsFor(EditedBy).length === 0) {
                for (const trait of EDITING_TRAITS) shapeEntity.remove(trait);
                shapeEntity.remove(IsRemoteDragging);
            }
        },
    };
});
