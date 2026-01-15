import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.tsx';
import './index.css';
import { world } from '@sim/n-body';
import { WorldProvider } from 'koota/react';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <WorldProvider world={world}>
            <App />
        </WorldProvider>
    </React.StrictMode>
);
