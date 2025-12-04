import react from '@vitejs/plugin-react';
import { vitePlugin } from '@koota/devtools/plugin';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), vitePlugin({})],
	server: {
		headers: {
			'Cross-Origin-Embedder-Policy': 'require-corp',
			'Cross-Origin-Opener-Policy': 'same-origin',
		},
	},
});
