export class SparseSet {
  /** Zero-copy backing storage. Only entries below length are live. */
  readonly dense: number[] = [];
  /** Low 24 bits select a bucket. Full values remain distinct in dense. */
  readonly sparse: number[] = [];
  length = 0;
  /** Dense indices link colliding values only after the first collision. */
  private links: number[] | undefined;

  has(val: number): boolean {
    if (this.links) return this.getIndex(val) !== -1;
    const index = this.sparse[val & 0xffffff];
    return index < this.length && this.dense[index] === val;
  }

  add(val: number): void {
    const key = val & 0xffffff;
    const head = this.sparse[key];

    if (head < this.length && (this.dense[head] & 0xffffff) === key) {
      if (this.has(val)) return;
      this.links ??= Array.from({ length: this.length }, () => -1);
      this.links[this.length] = head;
    } else if (this.links) {
      this.links[this.length] = -1;
    }

    this.sparse[key] = this.length;
    this.dense[this.length++] = val;
  }

  remove(val: number): void {
    const index = this.getIndex(val);
    if (index === -1) return;

    const links = this.links;
    if (links) {
      const key = val & 0xffffff;
      let previous = this.sparse[key];
      if (previous === index) {
        this.sparse[key] = links[index] === -1 ? this.length : links[index];
      } else {
        while (links[previous] !== index) previous = links[previous];
        links[previous] = links[index];
      }
    }

    this.length--;
    const swapped = this.dense[this.length];
    if (swapped !== val) {
      const key = swapped & 0xffffff;
      if (!links || this.sparse[key] === this.length) {
        this.sparse[key] = index;
      } else {
        let previous = this.sparse[key];
        while (links[previous] !== this.length) previous = links[previous];
        links[previous] = index;
      }
      this.dense[index] = swapped;
      if (links) links[index] = links[this.length];
    }
  }

  clear(): void {
    this.length = 0;
  }

  sort(): void {
    this.dense.length = this.length;
    this.dense.sort((a, b) => a - b);
    this.length = 0;
    for (let i = 0; i < this.dense.length; i++) {
      this.add(this.dense[i]);
    }
  }

  /** Returns the live dense index, or -1 when absent. */
  getIndex(val: number): number {
    const index = this.sparse[val & 0xffffff];
    if (!(index < this.length)) return -1;
    if (this.dense[index] === val) return index;
    return this.links ? this.findCollision(val, index) : -1;
  }

  private findCollision(val: number, index: number): number {
    if ((this.dense[index] & 0xffffff) !== (val & 0xffffff)) return -1;
    const links = this.links!;
    for (index = links[index]; index >= 0; index = links[index]) {
      if (this.dense[index] === val) return index;
    }
    return -1;
  }

  /** Copies the current contents into an independent array. */
  toArray(): number[] {
    return this.dense.slice(0, this.length);
  }
}
