import { relation, trait } from '@koota/core';

export const Position = trait({ x: 0, y: 0 });
export const Velocity = trait({ dx: 0, dy: 0 });
export const ChildOf = relation();
export const IsTagged = trait();
