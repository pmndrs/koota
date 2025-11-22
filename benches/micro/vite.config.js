import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import labVitePlugin from './labVitePlugin.js';
import logFile from './utils/constants/logFile.js';

export default defineConfig({
	plugins: [
		labVitePlugin({
			logFile: logFile,
		}),
		react(),
		tailwindcss(),
	],
});
