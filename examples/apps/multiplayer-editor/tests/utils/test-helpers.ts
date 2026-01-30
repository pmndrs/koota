import { createWorld } from 'koota';
import {
    Time,
    Pointer,
    History,
    Position,
    Rotation,
    Scale,
    Color,
    Shape,
    StableId,
    IsLocal,
    User,
    ClientId,
} from '../../src/core/traits';

export function createTestWorld() {
    return createWorld(Time, Pointer, History);
}

export function createLocalUser(world: ReturnType<typeof createTestWorld>) {
    const user = world.spawn(User, ClientId, IsLocal);
    user.set(User, { name: 'Test User' });
    user.set(ClientId, { id: 'test-user-1' });
    return user;
}

export function createShape(
    world: ReturnType<typeof createTestWorld>,
    props: { x: number; y: number; angle?: number; scaleX?: number; scaleY?: number }
) {
    const history = world.get(History)!;
    const id = history.idBase + history.nextId++;

    const entity = world.spawn(
        StableId({ id }),
        Shape({ type: 'rect' }),
        Position({ x: props.x, y: props.y }),
        Rotation({ angle: props.angle ?? 0 }),
        Scale({ x: props.scaleX ?? 1, y: props.scaleY ?? 1 }),
        Color({ r: 74, g: 144, b: 217 })
    );

    history.entities.set(id, entity);
    return entity;
}
