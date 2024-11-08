import { World } from 'koota';
import { Input, IsPlayer } from '../traits';

// Track key states.

const keys = {
	arrowUp: false,
	arrowDown: false,
	arrowLeft: false,
	arrowRight: false,
	w: false,
	a: false,
	s: false,
	d: false,
	space: false
};

window.addEventListener('keydown', (e) => {
	switch (e.key.toLowerCase()) {
		case 'arrowup':
		case 'w':
			keys.arrowUp = true;
			keys.w = true;
			break;
		case 'arrowdown':
		case 's':
			keys.arrowDown = true;
			keys.s = true;
			break;
		case 'arrowleft':
		case 'a':
			keys.arrowLeft = true;
			keys.a = true;
			break;
		case 'arrowright':
		case 'd':
			keys.arrowRight = true;
			keys.d = true;
			break;
		case " ":
			keys.space = true;
			break;
	}
});

window.addEventListener('keyup', (e) => {
	switch (e.key.toLowerCase()) {
		case 'arrowup':
		case 'w':
			keys.arrowUp = false;
			keys.w = false;
			break;
		case 'arrowdown':
		case 's':
			keys.arrowDown = false;
			keys.s = false;
			break;
		case 'arrowleft':
		case 'a':
			keys.arrowLeft = false;
			keys.a = false;
			break;
		case 'arrowright':
		case 'd':
			keys.arrowRight = false;
			keys.d = false;
			break;
		case " ":
			keys.space = false;
			break;
	}
});

export const pollInput = ({ world }: { world: World }) => {
	world.query(IsPlayer, Input).updateEach(
		([input]) => {
			input.isFiring = keys.space;

			// Get horizontal and vertical input.
			const horizontal =
				(keys.arrowRight || keys.d ? 1 : 0) - (keys.arrowLeft || keys.a ? 1 : 0);
			const vertical = (keys.arrowUp || keys.w ? 1 : 0) - (keys.arrowDown || keys.s ? 1 : 0);

			// Normalize the vector if moving diagonally.
			const length = Math.sqrt(horizontal * horizontal + vertical * vertical);
			if (length > 0) {
				input.direction.x = horizontal / (length || 1);
				input.direction.y = vertical / (length || 1);
			} else {
				input.direction.x = 0;
				input.direction.y = 0;
			}
		},
		{ changeDetection: true }
	);
};
