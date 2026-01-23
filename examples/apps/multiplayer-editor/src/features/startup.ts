import { useWorld } from 'koota/react';
import { useEffect } from 'react';
import { createMultiplayerClient } from '../core/multiplayer/client';

const WS_URL = import.meta.env.VITE_MP_SERVER_URL ?? 'ws://localhost:8787';

export function Startup() {
    const world = useWorld();

    useEffect(() => {
        const client = createMultiplayerClient({ world, url: WS_URL });
        client.connect();

        return () => {
            client.disconnect();
            client.dispose();
        };
    }, [world]);

    return null;
}
