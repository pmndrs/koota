import { createActions } from 'koota';
import { IsLocal } from '../traits';

export const userActions = createActions((world) => ({
    getLocalUser: () => {
        return world.queryFirst(IsLocal);
    },
}));
