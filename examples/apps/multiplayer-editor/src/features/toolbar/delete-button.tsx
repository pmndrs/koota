import { useActions } from 'koota/react';
import { selectionActions } from '../../core/actions';
import { Section } from '../ui/section';

export function DeleteButton() {
    const { deleteSelected } = useActions(selectionActions);

    return (
        <Section>
            <button onClick={deleteSelected} className="delete-btn">
                Delete
            </button>
        </Section>
    );
}
