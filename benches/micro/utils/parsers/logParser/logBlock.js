import blocks from "./blocks"

export const createNewBlock = (id, key) => {
    let type;
    for(const [blockKey] of Object.entries(blocks)){
      if(key.includes(blockKey)){
        type = blockKey;
        break;
      }
    }
    const newBlock = {
        id,
        key,
        type,
        children: [],
        lines: []
      };
      return newBlock
}

export const processBlock = (block) => {
  const {lines, ...startBlockData} = block;
  console.log(`[parser] Processing chunk: "${startBlockData.key}" (ID: ${startBlockData.id})`);
  let content = '';
  for(const [blockKey, blockFn] of Object.entries(blocks)){
    // mitata results
    if(startBlockData.id === 0){
      const markdownStart = lines.findIndex(str=>str.includes('| benchmark'));
      const markdownEnd = lines.length;
      content = {
        results: lines.slice(markdownStart, markdownEnd),
        // rawResults: JSON.parse(lines[lines.length-1])
      };
      break;
    }
    if(startBlockData.key.includes(blockKey)){
      content = blockFn(lines);
      break;
    }
  }
  return {
    ...startBlockData,
    content,
  };
}
