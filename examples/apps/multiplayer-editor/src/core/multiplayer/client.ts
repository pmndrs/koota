import type { World, Entity } from 'koota';
import { addCommitListener } from './commit-sink';
import type {
    ClientMessage,
    ServerMessage,
    ServerOp,
    Checkpoint,
    EphemeralSnapshot,
    EphemeralData,
} from './protocol';
import { SEQ_UNASSIGNED, type Op } from '../types';
import { rebaseWorld } from './rebase';
import { History, User } from '../traits';
import { applyCheckpoint } from './checkpoint';
import { applyOp } from '../ops/apply';
import { sendEphemeralPresence, setEphemeralSender } from './ephemeral';
import { presenceActions } from '../actions';

type PendingOp = {
    clientOpId: string;
    op: Op;
};

type MultiplayerClientOptions = {
    world: World;
    url: string;
};

export function createMultiplayerClient({ world, url }: MultiplayerClientOptions) {
    let socket: WebSocket | null = null;
    let clientId = '';
    let confirmedSeq = 0;
    let checkpoint: Checkpoint | null = null;
    let authoritativeOps: Op[] = [];
    let pendingOps: PendingOp[] = [];
    const sentOpIds = new Set<string>();
    let nextLocalOpId = 1;

    // Track user entities by their clientId
    const userEntities = new Map<string, Entity>();

    // Scoped presence actions
    const presence = presenceActions(world);

    function getOrCreateRemoteUserEntity(remoteClientId: string): Entity {
        let entity = userEntities.get(remoteClientId);
        if (!entity) {
            entity = presence.createUser(remoteClientId, { kind: 'remote' });
            userEntities.set(remoteClientId, entity);
        }
        return entity;
    }

    function removeUserEntity(remoteClientId: string) {
        const entity = userEntities.get(remoteClientId);
        if (entity) {
            presence.removeUser(entity);
            userEntities.delete(remoteClientId);
        }
    }

    const history = world.get(History);
    if (history && history.idBase === 0) {
        world.set(History, { ...history, idBase: createLocalIdBase() });
    }

    const stopCommitListener = addCommitListener((ops) => {
        const outboundOps = ops.map((op) => ({
            clientOpId: createClientOpId(),
            op: { ...op, seq: SEQ_UNASSIGNED },
        }));
        pendingOps = [...pendingOps, ...outboundOps];
        flushPendingOps();
    });

    function connect() {
        socket?.close();
        socket = new WebSocket(url);

        socket.addEventListener('open', () => {
            send({ type: 'hello', clientId, lastSeq: confirmedSeq });
        });

        socket.addEventListener('message', (event) => {
            parseServerMessage(event.data).then((message) => {
                if (!message) return;
                handleServerMessage(message);
            });
        });

        socket.addEventListener('close', () => {
            socket = null;
        });
    }

    function disconnect() {
        setEphemeralSender('', null);
        socket?.close();
        socket = null;
    }

    function handleServerMessage(message: ServerMessage) {
        switch (message.type) {
            case 'welcome': {
                clientId = message.clientId;
                confirmedSeq = message.checkpoint.seq;
                checkpoint = message.checkpoint;
                authoritativeOps = message.ops.map((entry) => entry.op);

                const history = world.get(History);
                if (history) {
                    world.set(History, {
                        ...history,
                        idBase: message.idBase,
                    });
                }

                // Create local user entity
                const localUserEntity = presence.createUser(clientId, { kind: 'local' });
                userEntities.set(clientId, localUserEntity);

                // Set up ephemeral sender now that we have clientId
                setEphemeralSender(clientId, send);
                // Broadcast our display name immediately (cursor/selection can follow later)
                sendEphemeralPresence(null, [], localUserEntity.get(User)?.name);

                applyCheckpoint(world, message.checkpoint);
                for (const op of authoritativeOps) {
                    applyOp(world, op);
                }

                // Apply ephemeral snapshot from other users
                if (message.ephemeral) {
                    applyEphemeralSnapshot(message.ephemeral);
                }

                if (pendingOps.length > 0) {
                    rebaseWorld(
                        world,
                        message.checkpoint,
                        authoritativeOps,
                        pendingOps.map((p) => p.op)
                    );
                }
                flushPendingOps();
                return;
            }

            case 'server-ops': {
                handleServerOps(message.ops);
                return;
            }

            case 'correction': {
                checkpoint = message.checkpoint;
                authoritativeOps = message.ops.map((entry) => entry.op);
                confirmedSeq = checkpoint.seq;
                rebaseWorld(
                    world,
                    checkpoint,
                    authoritativeOps,
                    pendingOps.map((p) => p.op)
                );
                return;
            }

            case 'reject': {
                pendingOps = pendingOps.filter((op) => op.clientOpId !== message.clientOpId);
                sentOpIds.delete(message.clientOpId);
                if (checkpoint) {
                    rebaseWorld(
                        world,
                        checkpoint,
                        authoritativeOps,
                        pendingOps.map((p) => p.op)
                    );
                }
                return;
            }

            case 'server-ephemeral': {
                handleServerEphemeral(message.clientId, message.data);
                return;
            }

            case 'user-left': {
                handleUserLeft(message.clientId);
                return;
            }
        }
    }

    function handleServerEphemeral(remoteClientId: string, data: EphemeralData) {
        const userEntity = getOrCreateRemoteUserEntity(remoteClientId);

        if (data?.type === 'presence') {
            if (data.name) {
                userEntity.set(User, { name: data.name });
            }
            presence.updateRemoteCursor(userEntity, data.cursor);
            presence.updateRemoteSelection(userEntity, data.selection);
        } else if (data?.type === 'transform' || data === null) {
            console.log('received transform', data);
            presence.updateRemoteTransform(userEntity, data);
        }
    }

    function handleUserLeft(remoteClientId: string) {
        removeUserEntity(remoteClientId);
    }

    function applyEphemeralSnapshot(snapshot: EphemeralSnapshot[]) {
        for (const entry of snapshot) {
            const userEntity = getOrCreateRemoteUserEntity(entry.clientId);

            if (entry.presence) {
                if (entry.presence.name) {
                    userEntity.set(User, { name: entry.presence.name });
                }
                presence.updateRemoteCursor(userEntity, entry.presence.cursor);
                presence.updateRemoteSelection(userEntity, entry.presence.selection);
            }

            if (entry.transform) {
                presence.updateRemoteTransform(userEntity, entry.transform);
            }
        }
    }

    function handleServerOps(ops: ServerOp[]) {
        if (ops.length === 0) return;

        const incomingOps = ops.map((entry) => entry.op);
        authoritativeOps = [...authoritativeOps, ...incomingOps];
        confirmedSeq = incomingOps[incomingOps.length - 1].seq;

        for (const entry of ops) {
            if (entry.clientId === clientId && entry.clientOpId) {
                pendingOps = pendingOps.filter((op) => op.clientOpId !== entry.clientOpId);
                sentOpIds.delete(entry.clientOpId);
            }
        }

        const hasRemoteOps = ops.some((entry) => entry.clientId && entry.clientId !== clientId);
        if (hasRemoteOps && checkpoint) {
            rebaseWorld(
                world,
                checkpoint,
                authoritativeOps,
                pendingOps.map((p) => p.op)
            );
        }
    }

    function createClientOpId() {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }
        return `op-${nextLocalOpId++}`;
    }

    function createLocalIdBase() {
        if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
            const buffer = new Uint32Array(1);
            crypto.getRandomValues(buffer);
            return (buffer[0] % 1_000_000) * 1_000_000;
        }
        return Math.floor(Math.random() * 1_000_000) * 1_000_000;
    }

    function flushPendingOps() {
        if (!clientId || pendingOps.length === 0) return;
        const unsentOps = pendingOps.filter((op) => !sentOpIds.has(op.clientOpId));
        if (unsentOps.length === 0) return;
        for (const op of unsentOps) {
            sentOpIds.add(op.clientOpId);
        }
        send({
            type: 'client-ops',
            clientId,
            baseSeq: confirmedSeq,
            ops: unsentOps,
        });
    }

    function send(message: ClientMessage) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify(message));
    }

    async function parseServerMessage(data: unknown): Promise<ServerMessage | null> {
        try {
            if (typeof data === 'string') {
                return JSON.parse(data) as ServerMessage;
            }
            if (data instanceof ArrayBuffer) {
                const text = new TextDecoder().decode(data);
                return JSON.parse(text) as ServerMessage;
            }
            if (data instanceof Blob) {
                const text = await data.text();
                return JSON.parse(text) as ServerMessage;
            }
            return null;
        } catch {
            return null;
        }
    }

    return { connect, disconnect, dispose: () => stopCommitListener() };
}
