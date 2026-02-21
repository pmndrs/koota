import type { Entity, World } from 'koota';
import { createChanged } from 'koota';
import { ChildOf, OrderedChildren, TotalValue, Value } from '../traits';

const Changed = createChanged();

const collectAncestorSum = (entity: Entity) => {
    let sum = 0;
    let current = entity.targetFor(ChildOf);
    while (current) {
        sum += current.get(Value)!.value;
        current = current.targetFor(ChildOf);
    }
    return sum;
};

const propagateDown = (world: World, entity: Entity, ancestorSum: number) => {
    const total = ancestorSum + entity.get(Value)!.value;

    if (entity.has(TotalValue)) {
        entity.set(TotalValue, { value: total });
    }

    const children = entity.get(OrderedChildren);
    if (children) {
        for (let i = 0; i < children.length; i++) {
            propagateDown(world, children[i], total);
        }
    }
};

export const propagate = ({ world }: { world: World }) => {
    for (const entity of world.query(Changed(Value))) {
        propagateDown(world, entity, collectAncestorSum(entity));
    }
};
