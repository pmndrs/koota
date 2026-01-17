import './app.css';
import { FrameLoop } from './frameloop';
import { Renderers } from './renderers';
import { Startup } from './startup';

export function App() {
	return (
		<>
			<Renderers />
			<FrameLoop />
			<Startup />
		</>
	);
}
