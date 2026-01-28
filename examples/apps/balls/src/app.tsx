import './app.css';
import { FrameLoop } from './view/frameloop';
import { Renderers } from './view/renderers';
import { Startup } from './view/startup';

export function App() {
	return (
		<>
			<Renderers />
			<FrameLoop />
			<Startup />
		</>
	);
}
