import { createActions, type Entity, type Trait } from 'koota';
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
    EDITING_TRAITS,
} from '../traits';
import { historyActions } from './history-actions';
import { sendEditStart, sendEditEnd } from '../multiplayer/ephemeral';
import { isActive } from '../utils/shape-helpers';

export type EditableProperty = 'position' | 'rotation' | 'scale' | 'color';
export type EditMode = 'drag' | 'discrete';

// Property configuration - maps each property to its traits and handlers
const PROPERTY_CONFIG = {
    position: {
        live: Position,
        editing: EditingPosition,
        toDurable: (pos: { x: number; y: number }) => ({
            durableX: pos.x,
            durableY: pos.y,
            targetX: pos.x,
            targetY: pos.y,
        }),
        toRestore: (editing: { durableX: number; durableY: number }) => ({
            x: editing.durableX,
            y: editing.durableY,
        }),
        broadcastDurable: (pos: { x: number; y: number }) => ({
            durableX: pos.x,
            durableY: pos.y,
        }),
    },
    rotation: {
        live: Rotation,
        editing: EditingRotation,
        toDurable: (rot: { angle: number }) => ({
            durableAngle: rot.angle,
            targetAngle: rot.angle,
        }),
        toRestore: (editing: { durableAngle: number }) => ({ angle: editing.durableAngle }),
        broadcastDurable: (rot: { angle: number }) => ({ durableAngle: rot.angle }),
    },
    scale: {
        live: Scale,
        editing: EditingScale,
        toDurable: (scale: { x: number; y: number }) => ({
            durableX: scale.x,
            durableY: scale.y,
            targetX: scale.x,
            targetY: scale.y,
        }),
        toRestore: (editing: { durableX: number; durableY: number }) => ({
            x: editing.durableX,
            y: editing.durableY,
        }),
        broadcastDurable: (scale: { x: number; y: number }) => ({
            durableScaleX: scale.x,
            durableScaleY: scale.y,
        }),
    },
    color: {
        live: Color,
        editing: EditingColor,
        toDurable: (color: { fill: string }) => ({ durableFill: color.fill }),
        toRestore: (editing: { durableFill: string }) => ({ fill: editing.durableFill }),
        broadcastDurable: (color: { fill: string }) => ({ durableFill: color.fill }),
    },
} as const;

const ALL_PROPERTIES: EditableProperty[] = ['position', 'rotation', 'scale', 'color'];

export const editingActions = createActions((world) => {
    const getLocalEditor = (entity: Entity) =>
        entity.targetsFor(EditedBy).find((editor) => editor.has(IsLocal));

    const hasAnyEditingTrait = (entity: Entity) => EDITING_TRAITS.some((trait) => entity.has(trait));

    return {
        /**
         * Start editing specified properties on an entity.
         * Captures the current (durable) values before editing begins.
         */
        startEditing: (
            entity: Entity,
            properties: EditableProperty[],
            editor?: Entity,
            mode: EditMode = 'drag'
        ) => {
            if (!isActive(entity)) return;
            const stableId = entity.get(StableId);
            if (!stableId) return;

            const durableValues: Record<string, number | string> = {};

            for (const prop of properties) {
                const config = PROPERTY_CONFIG[prop];
                const live = entity.get(config.live as Trait);
                if (live && !entity.has(config.editing as Trait)) {
                    entity.add((config.editing as any)(config.toDurable(live)));
                    Object.assign(durableValues, config.broadcastDurable(live));
                }
            }

            if (editor && !entity.has(EditedBy(editor))) {
                entity.add(EditedBy(editor));
            }

            if (editor?.has(IsLocal)) {
                sendEditStart({ shapeId: stableId.id, properties, mode, ...durableValues });
            }
        },

        /** Get the durable (pre-edit) values for an entity. */
        getDurableValues: (entity: Entity) => ({
            position: entity.get(EditingPosition),
            rotation: entity.get(EditingRotation),
            scale: entity.get(EditingScale),
            color: entity.get(EditingColor),
        }),

        /** Finish editing without committing - just removes editing state. */
        finishEditing: (entity: Entity, properties?: EditableProperty[]) => {
            const propsToFinish = properties ?? ALL_PROPERTIES;
            const localEditor = getLocalEditor(entity);

            for (const prop of propsToFinish) {
                entity.remove(PROPERTY_CONFIG[prop].editing as Trait);
            }

            if (!hasAnyEditingTrait(entity) && localEditor) {
                entity.remove(EditedBy(localEditor));
            }
        },

        /** Commit editing by creating history ops from durable -> current values. */
        commitEditing: (entity: Entity, properties?: EditableProperty[]) => {
            if (!isActive(entity)) return;
            const stableId = entity.get(StableId);
            if (!stableId) return;

            const propsToCommit = properties ?? ALL_PROPERTIES;
            const localEditor = getLocalEditor(entity);
            const isLocal = localEditor?.has(IsLocal);
            const history = historyActions(world);

            for (const prop of propsToCommit) {
                const config = PROPERTY_CONFIG[prop];
                const editing = entity.get(config.editing as Trait);
                const current = entity.get(config.live as Trait);

                if (editing && current) {
                    // Property-specific commit logic (different signatures)
                    if (prop === 'position') {
                        history.recordPositionChange(
                            entity,
                            { x: editing.durableX, y: editing.durableY },
                            { x: current.x, y: current.y }
                        );
                    } else if (prop === 'rotation') {
                        history.recordRotationChange([entity], editing.durableAngle, current.angle);
                    } else if (prop === 'scale') {
                        if (editing.durableX !== current.x) {
                            history.recordScaleChange([entity], 'x', editing.durableX, current.x);
                        }
                        if (editing.durableY !== current.y) {
                            history.recordScaleChange([entity], 'y', editing.durableY, current.y);
                        }
                    } else if (prop === 'color') {
                        history.recordColorChange([entity], editing.durableFill, current.fill);
                    }
                }
                entity.remove(config.editing as Trait);
            }

            if (localEditor) entity.remove(EditedBy(localEditor));
            if (isLocal) sendEditEnd({ shapeId: stableId.id, committed: true });
        },

        /** Cancel editing and restore to durable values. */
        cancelEditing: (entity: Entity, properties?: EditableProperty[]) => {
            if (!isActive(entity)) return;
            const stableId = entity.get(StableId);
            const propsToCancel = properties ?? ALL_PROPERTIES;
            const localEditor = getLocalEditor(entity);
            const isLocal = localEditor?.has(IsLocal);

            for (const prop of propsToCancel) {
                const config = PROPERTY_CONFIG[prop];
                const editing = entity.get(config.editing as Trait);
                if (editing) {
                    entity.set(config.live as Trait, config.toRestore(editing));
                    entity.remove(config.editing as Trait);
                }
            }

            if (localEditor) entity.remove(EditedBy(localEditor));
            if (isLocal && stableId) sendEditEnd({ shapeId: stableId.id, committed: false });
        },

        /** Check if an entity is being edited. */
        isEditing: (entity: Entity, property?: EditableProperty) => {
            if (property) return entity.has(PROPERTY_CONFIG[property].editing as Trait);
            return hasAnyEditingTrait(entity);
        },

        /** Get the user entity that is editing this shape. */
        getEditor: (entity: Entity) => entity.targetsFor(EditedBy)[0],
    };
});
