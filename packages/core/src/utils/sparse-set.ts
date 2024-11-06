export class SparseSet {
	#dense: number[] = [];
	#sparse: number[] = [];
	#cursor: number = 0;

	has(val: number): boolean {
		const index = this.#sparse[val];
		return index < this.#cursor && this.#dense[index] === val;
	}

	add(val: number): void {
		if (this.has(val)) return;
		this.#sparse[val] = this.#cursor;
		this.#dense[this.#cursor++] = val;
	}

	remove(val: number): void {
		if (!this.has(val)) return;
		const index = this.#sparse[val];
		this.#cursor--;
		const swapped = this.#dense[this.#cursor];
		if (swapped !== val) {
			this.#dense[index] = swapped;
			this.#sparse[swapped] = index;
		}
	}

	clear(): void {
		// Clear the sparse array entries for all active values
		for (let i = 0; i < this.#cursor; i++) {
			this.#sparse[this.#dense[i]] = 0;
		}
		this.#cursor = 0;
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
		return this.#dense.slice(0, this.#cursor);
	}

	get sparse(): number[] {
		return this.#sparse;
	}
}
