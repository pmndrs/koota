import { beforeEach, describe, expect, it } from 'vitest';
import { createChanged, createWorld, ordered, relation } from '../src';

describe('Ordered relations', () => {
    const world = createWorld();
    world.init();

    beforeEach(() => {
        world.reset();
    });

    it('should maintain ordered list when adding children via relation', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parent = world.spawn(OrderedChildren);
        const childA = world.spawn();
        const childB = world.spawn();
        const childC = world.spawn();

        // Add children via relation
        childA.add(ChildOf(parent));
        childB.add(ChildOf(parent));
        childC.add(ChildOf(parent));

        const children = parent.get(OrderedChildren)!;

        expect(children).toHaveLength(3);
        expect(children[0]).toBe(childA);
        expect(children[1]).toBe(childB);
        expect(children[2]).toBe(childC);
    });

    it('should sync relation when pushing to ordered list', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parent = world.spawn(OrderedChildren);
        const child = world.spawn();

        const children = parent.get(OrderedChildren)!;
        children.push(child);

        expect(children).toHaveLength(1);
        expect(children[0]).toBe(child);
        expect(child.has(ChildOf(parent))).toBe(true);
    });

    it('should sync relation when splicing from ordered list', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parent = world.spawn(OrderedChildren);
        const childA = world.spawn(ChildOf(parent));
        const childB = world.spawn(ChildOf(parent));
        const childC = world.spawn(ChildOf(parent));

        const children = parent.get(OrderedChildren)!;
        const removed = children.splice(1, 1);

        expect(children).toHaveLength(2);
        expect(children[0]).toBe(childA);
        expect(children[1]).toBe(childC);
        expect(removed[0]).toBe(childB);
        expect(childB.has(ChildOf(parent))).toBe(false);
    });

    it('should remove from list when relation is removed', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parent = world.spawn(OrderedChildren);
        const childA = world.spawn(ChildOf(parent));
        const childB = world.spawn(ChildOf(parent));
        const childC = world.spawn(ChildOf(parent));

        childB.remove(ChildOf(parent));

        const children = parent.get(OrderedChildren)!;
        expect(children).toHaveLength(2);
        expect(children[0]).toBe(childA);
        expect(children[1]).toBe(childC);
    });

    it('should support moveTo for reordering without relation changes', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parent = world.spawn(OrderedChildren);
        const childA = world.spawn(ChildOf(parent));
        const childB = world.spawn(ChildOf(parent));
        const childC = world.spawn(ChildOf(parent));

        const children = parent.get(OrderedChildren)!;
        children.moveTo(childA, 2);

        expect(children).toHaveLength(3);
        expect(children[0]).toBe(childB);
        expect(children[1]).toBe(childC);
        expect(children[2]).toBe(childA);

        // Relations should still exist
        expect(childA.has(ChildOf(parent))).toBe(true);
        expect(childB.has(ChildOf(parent))).toBe(true);
        expect(childC.has(ChildOf(parent))).toBe(true);
    });

    it('should support insert at specific index', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parent = world.spawn(OrderedChildren);
        const childA = world.spawn(ChildOf(parent));
        const childB = world.spawn(ChildOf(parent));
        const childC = world.spawn();

        const children = parent.get(OrderedChildren)!;
        children.insert(childC, 1);

        expect(children).toHaveLength(3);
        expect(children[0]).toBe(childA);
        expect(children[1]).toBe(childC);
        expect(children[2]).toBe(childB);
        expect(childC.has(ChildOf(parent))).toBe(true);
    });

    it('should support pop operation', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parent = world.spawn(OrderedChildren);
        const childA = world.spawn(ChildOf(parent));
        const childB = world.spawn(ChildOf(parent));

        const children = parent.get(OrderedChildren)!;
        const popped = children.pop();

        expect(popped).toBe(childB);
        expect(children).toHaveLength(1);
        expect(children[0]).toBe(childA);
        expect(childB.has(ChildOf(parent))).toBe(false);
    });

    it('should support shift operation', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parent = world.spawn(OrderedChildren);
        const childA = world.spawn(ChildOf(parent));
        const childB = world.spawn(ChildOf(parent));

        const children = parent.get(OrderedChildren)!;
        const shifted = children.shift();

        expect(shifted).toBe(childA);
        expect(children).toHaveLength(1);
        expect(children[0]).toBe(childB);
        expect(childA.has(ChildOf(parent))).toBe(false);
    });

    it('should support unshift operation', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parent = world.spawn(OrderedChildren);
        const childA = world.spawn(ChildOf(parent));
        const childB = world.spawn();

        const children = parent.get(OrderedChildren)!;
        children.unshift(childB);

        expect(children).toHaveLength(2);
        expect(children[0]).toBe(childB);
        expect(children[1]).toBe(childA);
        expect(childB.has(ChildOf(parent))).toBe(true);
    });

    it('should support sort operation', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parent = world.spawn(OrderedChildren);
        const child1 = world.spawn(ChildOf(parent));
        const child2 = world.spawn(ChildOf(parent));
        const child3 = world.spawn(ChildOf(parent));

        const children = parent.get(OrderedChildren)!;
        children.sort((a, b) => b - a); // Reverse sort

        expect(children).toHaveLength(3);
        expect(children[0]).toBe(child3);
        expect(children[1]).toBe(child2);
        expect(children[2]).toBe(child1);

        // Relations should still exist
        expect(child1.has(ChildOf(parent))).toBe(true);
        expect(child2.has(ChildOf(parent))).toBe(true);
        expect(child3.has(ChildOf(parent))).toBe(true);
    });

    it('should support reverse operation', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parent = world.spawn(OrderedChildren);
        const childA = world.spawn(ChildOf(parent));
        const childB = world.spawn(ChildOf(parent));
        const childC = world.spawn(ChildOf(parent));

        const children = parent.get(OrderedChildren)!;
        children.reverse();

        expect(children).toHaveLength(3);
        expect(children[0]).toBe(childC);
        expect(children[1]).toBe(childB);
        expect(children[2]).toBe(childA);

        // Relations should still exist
        expect(childA.has(ChildOf(parent))).toBe(true);
        expect(childB.has(ChildOf(parent))).toBe(true);
        expect(childC.has(ChildOf(parent))).toBe(true);
    });

    it('should work with native array methods', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parent = world.spawn(OrderedChildren);
        const childA = world.spawn(ChildOf(parent));
        const childB = world.spawn(ChildOf(parent));
        const childC = world.spawn(ChildOf(parent));

        const children = parent.get(OrderedChildren)!;

        // Test map
        const mapped = children.map((c) => c);
        expect(Array.isArray(mapped)).toBe(true);
        expect(mapped).toHaveLength(3);
        expect(mapped[0]).toBe(childA);
        expect(mapped[1]).toBe(childB);
        expect(mapped[2]).toBe(childC);

        // Test filter
        const filtered = children.filter((c) => c !== childB);
        expect(Array.isArray(filtered)).toBe(true);
        expect(filtered).toHaveLength(2);
        expect(filtered[0]).toBe(childA);
        expect(filtered[1]).toBe(childC);

        // Test indexOf
        expect(children.indexOf(childB)).toBe(1);

        // Test includes
        expect(children.includes(childA)).toBe(true);
    });

    it('should maintain separate lists for different parents', () => {
        const ChildOf = relation();
        const OrderedChildren = ordered(ChildOf);

        const parentA = world.spawn(OrderedChildren);
        const parentB = world.spawn(OrderedChildren);

        const child1 = world.spawn(ChildOf(parentA));
        const child2 = world.spawn(ChildOf(parentB));
        const child3 = world.spawn(ChildOf(parentA));

        const childrenA = parentA.get(OrderedChildren)!;
        const childrenB = parentB.get(OrderedChildren)!;

        expect(childrenA).toHaveLength(2);
        expect(childrenA[0]).toBe(child1);
        expect(childrenA[1]).toBe(child3);

        expect(childrenB).toHaveLength(1);
        expect(childrenB[0]).toBe(child2);
    });

    it('should clean up relations when destroying entity with ordered trait and autoDestroy orphan', () => {
        const ChildOf = relation({ autoDestroy: 'orphan' });
        const OrderedChildren = ordered(ChildOf);

        // Setup hierarchy: grandparent -> parent -> child
        const grandparent = world.spawn(OrderedChildren);
        const parent = world.spawn(OrderedChildren, ChildOf(grandparent));
        const child = world.spawn(OrderedChildren, ChildOf(parent));

        // Verify initial state
        expect(world.query(ChildOf(grandparent))).toContain(parent);
        expect(world.query(ChildOf(grandparent))).toHaveLength(1);

        // Destroy parent - cascades to child via autoDestroy: 'orphan'
        parent.destroy();

        // Parent and child should be destroyed
        expect(world.has(parent)).toBe(false);
        expect(world.has(child)).toBe(false);
        expect(world.has(grandparent)).toBe(true);

        // Query should return no children since parent was destroyed
        const childrenOfGrandparent = world.query(ChildOf(grandparent));
        expect(childrenOfGrandparent).toHaveLength(0);
    });

    it('should flag ordered trait as changed when structural changes occur', () => {
        const Changed = createChanged();
        const OrderedChildren = ordered(relation());

        const parent = world.spawn(OrderedChildren);
        const child1 = world.spawn();
        const child2 = world.spawn();

        const children = parent.get(OrderedChildren)!;

        // Initially no changes
        expect(world.query(Changed(OrderedChildren))).toHaveLength(0);

        // Push should flag as changed
        children.push(child1);
        expect(world.query(Changed(OrderedChildren))).toContain(parent);

        // Query consumed the change, should be empty now
        expect(world.query(Changed(OrderedChildren))).toHaveLength(0);

        // Pop should flag as changed
        children.push(child2);
        world.query(Changed(OrderedChildren));
        children.pop();
        expect(world.query(Changed(OrderedChildren))).toContain(parent);
    });
});
