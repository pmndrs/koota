import { WorldProvider } from 'koota/react';
import { App } from './src/app';
import { world } from './src/world';
import './styles.css';

export default function Root() {
    return (
        <WorldProvider world={world}>
            <App />
        </WorldProvider>
    );
}
