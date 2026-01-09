import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import kootaDevtools from 'koota/devtools/vite';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), kootaDevtools()],
    server: {
        headers: {
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
        },
    },
});
