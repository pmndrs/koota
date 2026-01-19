import { Canvas } from './canvas';
import { Toolbar } from './toolbar/toolbar';
import { Frameloop } from './frameloop';
import { DevTray } from './dev-tray';

export function App() {
    return (
        <>
            <Toolbar />
            <Canvas />
            <Frameloop />
            <DevTray />
        </>
    );
}
