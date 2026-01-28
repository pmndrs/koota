import { useActions } from 'koota/react';
import { useCallback } from 'react';
import type { Entity } from 'koota';
import { editingActions, userActions } from '../../core/actions';
import { Color } from '../../core/traits';
import { ColorPicker } from './color-picker';

export function ColorControl({ selected }: { selected: readonly Entity[] }) {
    const { startEditing, commitEditing, cancelEditing } = useActions(editingActions);
    const { getLocalUser } = useActions(userActions);

    const displayColor = selected[0]?.get(Color)?.fill ?? '#4a90d9';

    const handleOpen = useCallback(() => {
        const localUser = getLocalUser();
        for (const entity of selected) {
            startEditing(entity, ['color'], localUser);
        }
    }, [selected, startEditing, getLocalUser]);

    const handlePreview = useCallback(
        (hex: string) => {
            for (const entity of selected) {
                if (entity.has(Color)) entity.set(Color, { fill: hex });
            }
        },
        [selected]
    );

    const handleCommit = useCallback(() => {
        for (const entity of selected) {
            commitEditing(entity, ['color']);
        }
    }, [selected, commitEditing]);

    const handleCancel = useCallback(() => {
        for (const entity of selected) {
            cancelEditing(entity, ['color']);
        }
    }, [selected, cancelEditing]);

    return (
        <ColorPicker
            displayColor={displayColor}
            onOpen={handleOpen}
            onPreview={handlePreview}
            onCommit={handleCommit}
            onCancel={handleCancel}
        />
    );
}
