import { spawn } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { createLogParser } from './utils/parsers/logParser.js';

export default function labVitePlugin(options) {
  const { scriptToRun, logFile } = options;
  const LOG_FILE_PATH = path.resolve(logFile);

  return {
    name: 'koota-lab-plugin',

    configureServer(server) {
      if (!scriptToRun) {
        console.warn('[plugin] No script to run. Log streamer will only serve existing file.');
        return;
      }

      console.log(`[plugin] Clearing old log file: ${LOG_FILE_PATH}`);
      fs.writeFileSync(LOG_FILE_PATH, ''); 

      console.log(`[plugin] Spawning: ${scriptToRun}`);
      
      const child = spawn(scriptToRun, {
        shell: true,
        stdio: 'pipe'
      });

      const logStream = fs.createWriteStream(LOG_FILE_PATH, { flags: 'w' });

      child.stdout.pipe(logStream);
      child.stderr.pipe(logStream);

      child.on('spawn', () => {
         console.log(`[plugin] Benchmark process started (PID: ${child.pid}).`);
      });
      
      child.on('error', (err) => {
        console.error('[plugin] Failed to start benchmark script:', err);
        logStream.end();
      });
      
      child.on('close', (code) => {
        if (code !== 0) {
          console.error(`[plugin] Benchmark process failed with code ${code}.`);
        } else {
          console.log(`[plugin] Benchmark script finished successfully.`);
        }
        logStream.end();
      });
      
      server.middlewares.use('/stream-logs', (req, res, next) => {
        console.log('[plugin] Client connected to /stream-logs');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');

        const fileStream = fs.createReadStream(LOG_FILE_PATH);
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });
        
        const parser = createLogParser((processedData) => {
          res.write(`data: ${JSON.stringify(processedData)}\n\n`);
          if(processedData.event === 'complete'){
            res.write('event: done\ndata: {"message": "Stream complete"}\n\n');
          }
        });

        rl.on('line', (line) => {
          parser.processLine(line);
        });

        rl.on('close', () => {
          console.log('[plugin] Log file stream finished.');
        });

        req.on('close', () => {
          console.log('[plugin] Client disconnected.');
          rl.close();
          fileStream.destroy();
          res.end();
        });
      });
    }
  };
}