import { useWorld } from 'koota/react';
import { useEffect } from 'react';
import { createMultiplayerClient } from '../core/multiplayer/client';
import { IsCanvas, Pointer } from '../core/traits';

const WS_URL = import.meta.env.VITE_MP_SERVER_URL ?? 'ws://localhost:8787';

export function Startup() {
    const world = useWorld();

    useEffect(() => {
        const canvas = world.spawn(IsCanvas, Pointer);
        const client = createMultiplayerClient({ world, url: WS_URL });
        client.connect();

        return () => {
            canvas.destroy();
            client.disconnect();
            client.dispose();
        };
    }, [world]);

    return null;
}
