import { World } from 'koota';
import { Mesh, Position } from '../traits';

export const syncThreeObjects = ({ world }: { world: World }) => {
	world.query(Position, Mesh).updateEach(([position, mesh]) => {
		mesh.position.copy(position);
	});
};
