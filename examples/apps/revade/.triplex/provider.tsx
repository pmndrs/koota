import { WorldProvider } from 'koota/react';
import { world } from '../src/world';

export default function Provider({ children }: { children?: React.ReactNode }) {
    return <WorldProvider world={world}>{children}</WorldProvider>;
}
