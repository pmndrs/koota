import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import labVitePlugin from './labVitePlugin.js';
import logFile from './utils/constants/logFile.js';


const cliArgs = process.argv.slice(2);
const scriptToRun = cliArgs[cliArgs.indexOf('--') + 1];

export default defineConfig({
  plugins: [
    labVitePlugin({
      scriptToRun: scriptToRun,
      logFile: logFile
    }),
    react(),
    tailwindcss(),
  ],
});