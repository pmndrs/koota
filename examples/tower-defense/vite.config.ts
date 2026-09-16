import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'reload-game-world',
      handleHotUpdate({ file, server }) {
        // Reload ECS definitions and live worlds together.
        if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          server.ws.send({ type: 'full-reload' });
          return [];
        }
      },
    },
    react(),
  ],
});
