import { Not, type World } from 'koota';
import { History, Keyboard, Time } from '../traits';

export function updateTime(world: World) {
    const time = world.get(Time)!;
    const history = world.get(History)!;

    if (time.last === 0) time.last = performance.now();
    if (time.snapshot === 0) {
        time.snapshot = performance.now();
        history.push({ snapshot: world.snapshot(Not(Keyboard, History)), visited: 1 });
    }

    const now = performance.now();
    const delta = now - time.last;
    const snapshotDelta = now - time.snapshot;

    time.delta = Math.min(delta / 1000, 1 / 30);
    time.last = now;
    // if(snapshotDelta/1000 >= )

    world.set(Time, time);
}
