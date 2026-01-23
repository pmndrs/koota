import { createActions, type Entity } from 'koota';
import { User, ClientId, IsLocal, IsRemote, RemoteCursor, RemoteSelection } from '../traits';
import { createRandomUserName } from '../utils/user-name';

export const presenceActions = createActions((world) => {
    const createUser = (
        clientIdValue: string,
        options?: { kind: 'local' | 'remote'; name?: string }
    ) => {
        const kind = options?.kind ?? 'remote';
        const name = options?.name ?? createRandomUserName();

        const entity = world.spawn(User, ClientId, kind === 'local' ? IsLocal : IsRemote);
        entity.set(ClientId, { id: clientIdValue });
        entity.set(User, { name });
        return entity;
    };

    return {
        createUser,

        removeUser: (entity: Entity) => {
            entity.destroy();
        },

        updateRemoteCursor: (userEntity: Entity, cursor: { x: number; y: number } | null) => {
            if (cursor) {
                if (userEntity.has(RemoteCursor)) {
                    // Update target, keep current for interpolation
                    const current = userEntity.get(RemoteCursor)!;
                    userEntity.set(RemoteCursor, {
                        ...current,
                        targetX: cursor.x,
                        targetY: cursor.y,
                    });
                } else {
                    // New cursor - initialize at target
                    userEntity.add(RemoteCursor);
                    userEntity.set(RemoteCursor, {
                        x: cursor.x,
                        y: cursor.y,
                        targetX: cursor.x,
                        targetY: cursor.y,
                    });
                }
            } else {
                userEntity.remove(RemoteCursor);
            }
        },

        updateRemoteSelection: (userEntity: Entity, selection: number[]) => {
            if (selection.length > 0) {
                if (!userEntity.has(RemoteSelection)) {
                    userEntity.add(RemoteSelection);
                }
                userEntity.set(RemoteSelection, selection);
            } else {
                userEntity.remove(RemoteSelection);
            }
        },
    };
});
