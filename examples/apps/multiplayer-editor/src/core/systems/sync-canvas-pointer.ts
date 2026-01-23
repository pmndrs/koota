import type { Entity, World } from 'koota';
import { IsCanvas, IsCanvasHovering, Pointer } from '../traits';

function getCanvasEntity(world: World): Entity | null {
    let canvas: Entity | null = null;
    world.query(IsCanvas).readEach((_, entity) => {
        if (!canvas) canvas = entity;
    });
    return canvas;
}

export function syncCanvasPointer(world: World, pointer: { x: number; y: number }) {
    const canvas = getCanvasEntity(world);
    if (!canvas) return;
    if (!canvas.has(Pointer)) {
        canvas.add(Pointer);
    }
    canvas.set(Pointer, { x: pointer.x, y: pointer.y });
    if (!canvas.has(IsCanvasHovering)) {
        canvas.add(IsCanvasHovering);
    }
}

export function clearCanvasPointer(world: World) {
    const canvas = getCanvasEntity(world);
    if (!canvas) return;
    canvas.remove(IsCanvasHovering);
}
