// Originally by Hendrik Mans: https://github.com/hmans/miniplex/blob/main/apps/demo/src/systems/SpatialHashingSystem.tsx

import { Entity } from 'koota';

type Cell = Set<Entity>;

export class SpatialHashMap {
	protected cells = new Map<string, Cell>();
	protected entityToCell = new Map<Entity, Cell>();

	constructor(public cellSize: number) {}

	setEntity(entity: Entity, x: number, y: number, z: number) {
		const cell = this.getCell(x, y, z);

		/* Remove from previous hash if known */
		const oldCell = this.entityToCell.get(entity);

		if (oldCell) {
			/* If hash didn't change, do nothing */
			if (oldCell === cell) return;

			/* Remove from previous hash */
			oldCell.delete(entity);
		}

		cell.add(entity);
		this.entityToCell.set(entity, cell);
	}

	removeEntity(entity: Entity) {
		const cell = this.entityToCell.get(entity);
		cell?.delete(entity);
		this.entityToCell.delete(entity);
	}

	getNearbyEntities(
		x: number,
		y: number,
		z: number,
		radius: number,
		entities: Entity[] = [],
		maxEntities = Infinity
	) {
		let count = 0;
		entities.length = 0;

		for (let dx = x - radius; dx <= x + radius; dx += this.cellSize) {
			for (let dy = y - radius; dy <= y + radius; dy += this.cellSize) {
				for (let dz = z - radius; dz <= z + radius; dz += this.cellSize) {
					const cell = this.getCell(dx, dy, dz);

					for (const entity of cell) {
						entities.push(entity);
						count++;

						if (count >= maxEntities) return entities;
					}
				}
			}
		}

		return entities;
	}

	reset() {
		this.cells.clear();
		this.entityToCell.clear();
	}

	protected getCell(x: number, y: number, z: number) {
		const hash = this.calculateHash(x, y, z, this.cellSize);

		if (!this.cells.has(hash)) {
			this.cells.set(hash, new Set());
		}

		return this.cells.get(hash)!;
	}

	protected calculateHash(x: number, y: number, z: number, cellSize: number) {
		const hx = Math.floor(x / cellSize);
		const hy = Math.floor(y / cellSize);
		const hz = Math.floor(z / cellSize);

		return `${hx}:${hy}:${hz}`;
	}
}
