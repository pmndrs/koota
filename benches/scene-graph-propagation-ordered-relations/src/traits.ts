import { relation, trait, ordered } from 'koota';
import {
    ChildOf,
    IsGroup,
    IsObject,
    Value,
    TotalValue
} from "@bench/scene-graph-propagation"

const OrderedChildren = ordered(ChildOf);

export {
    ChildOf,
    IsGroup,
    IsObject,
    Value,
    TotalValue,
    OrderedChildren
}