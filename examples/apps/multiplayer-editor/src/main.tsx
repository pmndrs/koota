import React from 'react';
import ReactDOM from 'react-dom/client';
import { WorldProvider } from 'koota/react';
import { App } from './app/app';
import { world } from './core/world';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <WorldProvider world={world}>
            <App />
        </WorldProvider>
    </React.StrictMode>
);
