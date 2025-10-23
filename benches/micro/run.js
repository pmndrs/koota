import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// --- Recreate __dirname for ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const benchPath = args[0]; // This is the full path from micro.ts

const nodeArgs = [
  '--allow-natives-syntax',
  // '--trace-opt',
  '--trace-deopt',
  '--expose-gc',
];
const finalNodeCommand = [
  'node',
  ...nodeArgs,
  benchPath
].join(' ');

console.log(`[run.js] Starting Vite and passing command:`);
console.log(`[run.js] ${finalNodeCommand}`);

// koota uses pnpm
spawn('pnpm', 
    [
      'vite',
      '--',   // pass-through flag
      finalNodeCommand
    ],
    {
      stdio: 'inherit',
      cwd: __dirname
    }
);