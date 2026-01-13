import { Renderer } from './renderer';
import { Startup } from './startup';
import { Frameloop } from './frameloop';

export function App() {
    return (
        <Startup>
            <Renderer />
            <Frameloop />
        </Startup>
    );
}
