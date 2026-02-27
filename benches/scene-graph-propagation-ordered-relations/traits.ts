import { relation, trait, ordered } from 'koota';
import {
    ChildOf,
    IsGroup,
    IsObject,
    Value,
    TotalValue
} from '../scene-graph-propagation/traits.ts'

const OrderedChildren = ordered(ChildOf);

export {
    ChildOf,
    IsGroup,
    IsObject,
    Value,
    TotalValue,
    OrderedChildren
}