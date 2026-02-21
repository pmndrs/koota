import { relation, trait, ordered } from 'koota';

export const ChildOf = relation({ exclusive: true });
export const OrderedChildren = ordered(ChildOf);
export const IsGroup = trait();
export const IsObject = trait();
export const Value = trait({ value: 0 });
export const TotalValue = trait({ value: 0 });
