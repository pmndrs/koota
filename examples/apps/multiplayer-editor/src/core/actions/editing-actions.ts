import { createActions, type Entity } from 'koota';
import {
    Position,
    Rotation,
    Scale,
    Color,
    EditingPosition,
    EditingRotation,
    EditingScale,
    EditingColor,
    EditedBy,
    StableId,
    IsLocal,
} from '../traits';
import { historyActions } from './history-actions';
import { sendEditStart, sendEditEnd } from '../multiplayer/ephemeral';

export type EditableProperty = 'position' | 'rotation' | 'scale' | 'color';

export const editingActions = createActions((world) => {
    const getLocalEditor = (entity: Entity) => {
        return entity.targetsFor(EditedBy).find((editor) => editor.has(IsLocal));
    };

    return {
    /**
     * Start editing specified properties on an entity.
     * Captures the current (durable) values before editing begins.
     */
    startEditing: (entity: Entity, properties: EditableProperty[], editor?: Entity) => {
        const stableId = entity.get(StableId);
        if (!stableId) return;

        // Collect durable values for broadcast
        const durableValues: {
            durableX?: number;
            durableY?: number;
            durableAngle?: number;
            durableScaleX?: number;
            durableScaleY?: number;
            durableFill?: string;
        } = {};

        for (const prop of properties) {
            switch (prop) {
                case 'position': {
                    const pos = entity.get(Position);
                    if (pos && !entity.has(EditingPosition)) {
                        entity.add(EditingPosition({ durableX: pos.x, durableY: pos.y }));
                        durableValues.durableX = pos.x;
                        durableValues.durableY = pos.y;
                    }
                    break;
                }
                case 'rotation': {
                    const rot = entity.get(Rotation);
                    if (rot && !entity.has(EditingRotation)) {
                        entity.add(EditingRotation({ durableAngle: rot.angle }));
                        durableValues.durableAngle = rot.angle;
                    }
                    break;
                }
                case 'scale': {
                    const scale = entity.get(Scale);
                    if (scale && !entity.has(EditingScale)) {
                        entity.add(EditingScale({ durableX: scale.x, durableY: scale.y }));
                        durableValues.durableScaleX = scale.x;
                        durableValues.durableScaleY = scale.y;
                    }
                    break;
                }
                case 'color': {
                    const color = entity.get(Color);
                    if (color && !entity.has(EditingColor)) {
                        entity.add(EditingColor({ durableFill: color.fill }));
                        durableValues.durableFill = color.fill;
                    }
                    break;
                }
            }
        }

        // Track who is editing (for multiplayer UI)
        if (editor && !entity.has(EditedBy(editor))) {
            entity.add(EditedBy(editor));
        }

        // Broadcast edit start if this is a local edit
        if (editor?.has(IsLocal)) {
            sendEditStart({
                shapeId: stableId.id,
                properties,
                ...durableValues,
            });
        }
    },

    /**
     * Get the durable (pre-edit) values for an entity.
     * Returns null for properties not currently being edited.
     */
    getDurableValues: (entity: Entity) => {
        return {
            position: entity.get(EditingPosition),
            rotation: entity.get(EditingRotation),
            scale: entity.get(EditingScale),
            color: entity.get(EditingColor),
        };
    },

    /**
     * Finish editing and remove editing state.
     * Does NOT restore values - current values are kept.
     * Call this after committing an op or when remote edit ends.
     */
    finishEditing: (entity: Entity, properties?: EditableProperty[]) => {
        const propsToFinish = properties ?? ['position', 'rotation', 'scale', 'color'];
        const localEditor = getLocalEditor(entity);

        for (const prop of propsToFinish) {
            switch (prop) {
                case 'position':
                    entity.remove(EditingPosition);
                    break;
                case 'rotation':
                    entity.remove(EditingRotation);
                    break;
                case 'scale':
                    entity.remove(EditingScale);
                    break;
                case 'color':
                    entity.remove(EditingColor);
                    break;
            }
        }

        // Remove editor if no editing traits remain
        if (
            !entity.has(EditingPosition) &&
            !entity.has(EditingRotation) &&
            !entity.has(EditingScale) &&
            !entity.has(EditingColor)
        ) {
            if (localEditor) {
                entity.remove(EditedBy(localEditor));
            }
        }
    },

    /**
     * Commit editing by creating history ops from durable -> current values.
     * Removes editing state after creating ops.
     */
    commitEditing: (entity: Entity, properties?: EditableProperty[]) => {
        const propsToCommit = properties ?? ['position', 'rotation', 'scale', 'color'];
        const stableId = entity.get(StableId);
        if (!stableId) return;

        const localEditor = getLocalEditor(entity);
        const isLocal = localEditor?.has(IsLocal);
        const history = historyActions(world);

        // Create ops from durable -> current for each property
        for (const prop of propsToCommit) {
            switch (prop) {
                case 'position': {
                    const editing = entity.get(EditingPosition);
                    const current = entity.get(Position);
                    if (editing && current) {
                        history.recordPositionChange(
                            entity,
                            { x: editing.durableX, y: editing.durableY },
                            { x: current.x, y: current.y }
                        );
                    }
                    entity.remove(EditingPosition);
                    break;
                }
                case 'rotation': {
                    const editing = entity.get(EditingRotation);
                    const current = entity.get(Rotation);
                    if (editing && current) {
                        history.recordRotationChange([entity], editing.durableAngle, current.angle);
                    }
                    entity.remove(EditingRotation);
                    break;
                }
                case 'scale': {
                    const editing = entity.get(EditingScale);
                    const current = entity.get(Scale);
                    if (editing && current) {
                        // Record scale changes separately for X and Y
                        if (editing.durableX !== current.x) {
                            history.recordScaleXChange([entity], editing.durableX, current.x);
                        }
                        if (editing.durableY !== current.y) {
                            history.recordScaleYChange([entity], editing.durableY, current.y);
                        }
                    }
                    entity.remove(EditingScale);
                    break;
                }
                case 'color': {
                    const editing = entity.get(EditingColor);
                    const current = entity.get(Color);
                    if (editing && current) {
                        history.recordColorChange([entity], editing.durableFill, current.fill);
                    }
                    entity.remove(EditingColor);
                    break;
                }
            }
        }

        // Remove editor if no editing traits remain
        if (localEditor) {
            entity.remove(EditedBy(localEditor));
        }

        // Broadcast edit end (committed) if this is a local edit
        if (isLocal) {
            sendEditEnd({ shapeId: stableId.id, committed: true });
        }
    },

    /**
     * Cancel editing and restore to durable values.
     */
    cancelEditing: (entity: Entity, properties?: EditableProperty[]) => {
        const propsToCancel = properties ?? ['position', 'rotation', 'scale', 'color'];
        const stableId = entity.get(StableId);
        const localEditor = getLocalEditor(entity);
        const isLocal = localEditor?.has(IsLocal);

        for (const prop of propsToCancel) {
            switch (prop) {
                case 'position': {
                    const editing = entity.get(EditingPosition);
                    if (editing) {
                        entity.set(Position, { x: editing.durableX, y: editing.durableY });
                        entity.remove(EditingPosition);
                    }
                    break;
                }
                case 'rotation': {
                    const editing = entity.get(EditingRotation);
                    if (editing) {
                        entity.set(Rotation, { angle: editing.durableAngle });
                        entity.remove(EditingRotation);
                    }
                    break;
                }
                case 'scale': {
                    const editing = entity.get(EditingScale);
                    if (editing) {
                        entity.set(Scale, { x: editing.durableX, y: editing.durableY });
                        entity.remove(EditingScale);
                    }
                    break;
                }
                case 'color': {
                    const editing = entity.get(EditingColor);
                    if (editing) {
                        entity.set(Color, { fill: editing.durableFill });
                        entity.remove(EditingColor);
                    }
                    break;
                }
            }
        }

        // Remove editor if no editing traits remain
        if (localEditor) {
            entity.remove(EditedBy(localEditor));
        }

        // Broadcast edit end (cancelled) if this is a local edit
        if (isLocal && stableId) {
            sendEditEnd({ shapeId: stableId.id, committed: false });
        }
    },

    /**
     * Check if an entity is being edited.
     */
    isEditing: (entity: Entity, property?: EditableProperty) => {
        if (property) {
            switch (property) {
                case 'position':
                    return entity.has(EditingPosition);
                case 'rotation':
                    return entity.has(EditingRotation);
                case 'scale':
                    return entity.has(EditingScale);
                case 'color':
                    return entity.has(EditingColor);
            }
        }
        return (
            entity.has(EditingPosition) ||
            entity.has(EditingRotation) ||
            entity.has(EditingScale) ||
            entity.has(EditingColor)
        );
    },

    /**
     * Get the user entity that is editing this shape.
     */
    getEditor: (entity: Entity) => {
        return entity.targetsFor(EditedBy)[0];
    },
    };
});
