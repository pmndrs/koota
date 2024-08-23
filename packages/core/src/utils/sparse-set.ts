export class SparseSet {
	#dense: number[] = [];
	#sparse: number[] = [];

	has(val: number): boolean {
		return this.#dense[this.#sparse[val]] === val;
	}

	add(val: number): void {
		if (this.has(val)) return;
		this.#sparse[val] = this.#dense.push(val) - 1;
	}

	remove(val: number): void {
		if (!this.has(val)) return;
		const index = this.#sparse[val];
		const swapped = this.#dense.pop()!;
		if (swapped !== val) {
			this.#dense[index] = swapped;
			this.#sparse[swapped] = index;
		}
	}

	clear(): void {
		this.#dense.length = 0;
		this.#sparse.length = 0;
	}

	sort(): void {
		this.#dense.sort((a, b) => a - b);
		for (let i = 0; i < this.#dense.length; i++) {
			this.#sparse[this.#dense[i]] = i;
		}
	}

	getIndex(val: number): number {
		return this.#sparse[val];
	}

	get dense(): number[] {
		return this.#dense;
	}

	get sparse(): number[] {
		return this.#sparse;
	}
}
