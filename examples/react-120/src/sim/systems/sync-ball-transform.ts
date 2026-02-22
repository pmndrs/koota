import type { World } from 'koota';
import { Ball, Position, Ref, Scale } from '../traits';

export function syncBallTransform(world: World) {
	world.query(Ball, Position, Scale, Ref).updateEach(([{ radius }, position, scale, ref]) => {
		const translateCss = `translate(${position.x - radius}px, ${position.y - radius}px)`;
		const scaleCss = `scale(${scale.value})`;
		ref.style.transform = `${translateCss} ${scaleCss}`;
	});
}
