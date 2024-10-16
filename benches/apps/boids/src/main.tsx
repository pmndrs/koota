import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app.tsx';
import './index.css';
import { WorldProvider } from 'koota/react';
import { world } from './world.ts';

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<WorldProvider world={world}>
			<App />
		</WorldProvider>
	</React.StrictMode>
);
