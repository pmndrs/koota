import { Velocity } from '../components/Velocity';
import { Color } from '../components/Color';
import { colorFromSpeed } from '../utils/colorFromSpeed';
import { getIndex, Not } from 'koota';
import { Repulse } from '../components';

export const updateColor = ({ world }: { world: Koota.World }) => {
	const ents = world.query(Velocity, Color, Not(Repulse));
	const [velocity, color] = world.get(Velocity, Color);

	for (let i = 0; i < ents.length; i++) {
		const eid = getIndex(ents[i]);

		const speed = Math.sqrt(velocity.x[eid] ** 2 + velocity.y[eid] ** 2);
		const { r, g, b, a } = colorFromSpeed(speed);

		color.r[eid] = r;
		color.g[eid] = g;
		color.b[eid] = b;
		color.a[eid] = a;
	}
};
