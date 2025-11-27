import { relation } from 'koota';

export const FiredBy = relation({ autoRemoveTarget: true });

export const Targeting = relation({ exclusive: true });
