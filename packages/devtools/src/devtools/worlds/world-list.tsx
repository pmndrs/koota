import type { World } from '@koota/core';
import { WorldRow } from './world-row';

interface WorldListProps {
	worlds: World[];
	onSelect: (world: World) => void;
}

export function WorldList({ worlds, onSelect }: WorldListProps) {
	return (
		<>
			{worlds.map((world) => (
				<WorldRow key={world.id} world={world} onSelect={() => onSelect(world)} />
			))}
		</>
	);
}
