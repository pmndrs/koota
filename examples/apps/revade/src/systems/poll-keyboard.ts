import { Not, type World } from 'koota';
import { EnemySpawner, History, Input, IsPlayer, Keyboard, Movement, SpatialHashMap, Time, Transform } from '../traits';

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
        const recordKey = keys.has('r');
        const goBackKey = keys.has('z');

        if (goBackKey || recordKey) {
            const history = world.get(History)!;
            if (goBackKey) {
                if (history.length) {
                    const h = history[history.length - 1];
                    h.visited++;
                    if (h.visited >= 2) {
                        history.pop()!;
                    }
                    const current = world.snapshot(IsPlayer, Movement, Input, Transform);
                    world.load(h.snapshot);
                    world.add(Keyboard, History)
                    console.log('history loaded', { h, current });
                    return;
                } else {
                    console.log('no history left', { history });
                }
            } else if (recordKey) {
                const prevH = history.length;
                if (prevH) {
                    console.log('too much history', { history });
                } else {
                    const h = { snapshot: world.snapshot(IsPlayer, Movement, Input, Transform), visited: 0 };
                    history.push(h);
                    console.log('history pushed', { h });
                }
            }
        }

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
