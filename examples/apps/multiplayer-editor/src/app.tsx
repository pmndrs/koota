import { Canvas } from './features/canvas';
import { Toolbar } from './features/toolbar/toolbar';
import { Frameloop } from './features/frameloop';
import { DevTray } from './features/dev/dev-tray';
import { RemoteCursorRenderer } from './features/presence/remote-cursor-renderer';
import { Startup } from './features/startup';

export function App() {
    return (
        <>
            <Toolbar />
            <Canvas />
            <RemoteCursorRenderer />
            <DevTray />

            <Frameloop />
            <Startup />
        </>
    );
}
