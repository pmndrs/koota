import logDelimiters from '../constants/logDelimiters.js';
import { createNewBlock, processBlock } from './logParser/logBlock.js';

function parseDelimiter(line) {
  const trimmedLine = line.trim();
  const startPrefix = logDelimiters.start + ' '; // e.g., "__Start__ "
  const endPrefix = logDelimiters.end + ' ';   // e.g., "__End__ "

  if (trimmedLine.startsWith(startPrefix)) {
    // key is everything after the prefix
    const key = trimmedLine.substring(startPrefix.length);
    return { type: 'start', key };
  }
  
  if (trimmedLine.startsWith(endPrefix)) {
    const key = trimmedLine.substring(endPrefix.length);
    return { type: 'end', key };
  }

  return null;
}

export function createLogParser(pushData) {
  const stack = [];
  const rootNodes = [];
  let blockIdCounter = 0;

  const processLine = (line) => {
    const delimiter = parseDelimiter(line);

    if (delimiter?.type === 'start') {
      const parentBlock = stack.length > 0 ? stack[stack.length - 1] : null;
      const newBlock = createNewBlock(blockIdCounter++, delimiter.key)
      
      if (parentBlock) {
        parentBlock.children.push(newBlock);
      } else {
        rootNodes.push(newBlock);
      }

      stack.push(newBlock);
      pushData({
          event: 'block_start',
          blockId: newBlock.id,
      });
    } else if (delimiter?.type === 'end') {
      if (stack.length === 0) {
        console.warn(`[parser] Found an end delimiter "${line}" with no open block.`);
        return;
      }
      const currentBlock = stack[stack.length - 1];
      if (currentBlock.key !== delimiter.key) {
        console.warn(`[parser] Mismatched delimiter! Expected end for "${currentBlock.key}" but got end for "${delimiter.key}".`);
        return;
      }
      const completedBlock = stack.pop();
      const processedData = processBlock(completedBlock);

      delete completedBlock.lines;
      Object.assign(completedBlock, processedData)
      
      pushData({
          event: 'block_end',
          blockId: processedData.id,
      });
      if(stack.length === 0){
        pushData({
          event: 'complete',
          rootNodes,
        });
      }
    } else {
      if (stack.length > 0) {
        const currentBlock = stack[stack.length - 1];
        currentBlock.lines.push(line);
      }
    }
  };

  return { processLine };
}