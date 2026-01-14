import type { World } from 'koota';
import { Input, IsPlayer, Keyboard } from '../traits';

export function pollKeyboard(world: World) {
    const keys = world.get(Keyboard)!;

    world.query(IsPlayer, Input).updateEach(([input]) => {
        // Get horizontal and vertical input.
        const horizontal =
            (keys.has('arrowright') || keys.has('d') ? 1 : 0) -
            (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
        const vertical =
            (keys.has('arrowup') || keys.has('w') ? 1 : 0) -
            (keys.has('arrowdown') || keys.has('s') ? 1 : 0);

        // Normalize the vector if moving diagonally.
        const length = Math.sqrt(horizontal * horizontal + vertical * vertical);
        if (length > 0) {
            input.x = horizontal / (length || 1);
            input.y = vertical / (length || 1);
        } else {
            input.x = 0;
            input.y = 0;
        }
    });
}
