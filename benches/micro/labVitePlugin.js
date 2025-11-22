import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { createLogParser } from './utils/parsers/logParser.js';

export default function labVitePlugin(options) {
	const { logFile } = options;
	const LOG_FILE_PATH = path.resolve(logFile);

	return {
		name: 'koota-lab-plugin',

		configureServer(server) {
			// Check if log file exists
			if (!fs.existsSync(LOG_FILE_PATH)) {
				console.warn(`[plugin] Log file not found: ${LOG_FILE_PATH}`);
				console.warn('[plugin] Run a benchmark first to generate results.');
			} else {
				console.log(`[plugin] Ready to serve results from: ${LOG_FILE_PATH}`);
			}

			server.middlewares.use('/stream-logs', (req, res) => {
				console.log('[plugin] Client connected to /stream-logs');

				if (!fs.existsSync(LOG_FILE_PATH)) {
					res.writeHead(404);
					res.end('No benchmark results found. Run a benchmark first.');
					return;
				}

				res.setHeader('Content-Type', 'text/event-stream');
				res.setHeader('Cache-Control', 'no-cache');

				const fileStream = fs.createReadStream(LOG_FILE_PATH);
				const rl = readline.createInterface({
					input: fileStream,
					crlfDelay: Infinity,
				});

				const parser = createLogParser((processedData) => {
					res.write(`data: ${JSON.stringify(processedData)}\n\n`);
					if (processedData.event === 'complete') {
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
		},
	};
}
