import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { world } from '@examples/n-body';
import { WorldProvider } from 'koota/react';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <WorldProvider world={world}>
            <App />
        </WorldProvider>
    </React.StrictMode>
);
