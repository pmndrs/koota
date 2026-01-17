import { WorldProvider } from 'koota/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import './index.css';
import { world } from '@sim/balls';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<WorldProvider world={world}>
			<App />
		</WorldProvider>
	</StrictMode>
);
