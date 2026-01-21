import React from 'react';
import ReactDOM from 'react-dom/client';
import { WorldProvider } from 'koota/react';
import { App } from './features/app';
import { world } from './core/world';
import { createMultiplayerClient } from './core/multiplayer/client';
import './index.css';

const multiplayerClient = createMultiplayerClient({
    world,
    url: import.meta.env.VITE_MP_SERVER_URL ?? 'ws://localhost:8787',
});

multiplayerClient.connect();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <WorldProvider world={world}>
            <App />
        </WorldProvider>
    </React.StrictMode>
);
