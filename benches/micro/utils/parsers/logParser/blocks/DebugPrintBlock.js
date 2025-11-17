const memoryAddressAndTypeRegex = /^DebugPrint: (0x[0-9a-fA-F]+): (\[.+\])/;

const lineParsers = {
    map: {
        regex: /- map: (0x[0-9a-fA-F]+) <Map\[[0-9]+\]\((.+)\)> \[(.+)\]/,
        parse: (match) => ({
            address: match[1],
            elementsType: match[2],
            properties: match[3]
        })
    },
    elements: {
        regex: /- elements: (0x[0-9a-fA-F]+) <([^[]+)\[([0-9]+)\]> \[(.+)\]/,
        parse: (match) => ({
            address: match[1],
            arrayType: match[2],
            size: parseInt(match[3], 10),
            elementsKind: match[4]
        })
    },
    length: {
        regex: /- length: ([0-9]+)/,
        parse: (match) => parseInt(match[1], 10)
    },
    kind: {
        regex: /- kind: (.+)/,
        parse: (match) => match[1].trim()
    },
    prototype: {
        regex: /- prototype: (0x[0-9a-fA-F]+) <(.+)>/,
        parse: (match) => ({ address: match[1], type: match[2] })
    },
    functionPrototype: {
        regex: /- function prototype: <(.+)>/,
        parse: (match) => match[1]
    },
    sharedInfo: {
        regex: /- shared_info: (0x[0-9a-fA-F]+) <(.+)>/,
        parse: (match) => ({ address: match[1], type: match[2] })
    },
    name: {
        regex: /- name: .*: #(.+)>$/,
        parse: (match) => match[1]
    },
    formalParameterCount: {
        regex: /- formal_parameter_count: ([0-9]+)/,
        parse: (match) => parseInt(match[1], 10)
    },
    code: {
        regex: /- code: (0x[0-9a-fA-F]+) <Code (.+)>/,
        parse: (match) => ({ address: match[1], type: match[2] })
    },
    invocationCount: {
        regex: /- invocation count: ([0-9]+)/,
        parse: (match) => parseInt(match[1], 10)
    }
};

const parseMetadata = (lines, keysToFind) => {
    const metadata = {};
    const remainingLines = [];
    const foundKeys = new Set();

    for (const line of lines) {
        let wasMetadata = false;
        for (const key of keysToFind) {
            if (foundKeys.has(key)) continue;

            const parser = lineParsers[key];
            if (!parser) continue;

            const match = line.match(parser.regex);

            if (match) {
                metadata[key] = parser.parse(match);
                foundKeys.add(key);
                wasMetadata = true;
                break;
            }
        }
        if (!wasMetadata) {
            remainingLines.push(line);
        }
    }
    
    return { metadata, remainingLines };
};

const parseArray = (lines) => {
    const { metadata, remainingLines } = parseMetadata(lines, ['map', 'elements', 'length']);
    let elementsListStartIndex = -1;
    let value;

    if (metadata.elements) {
        // %DebugPrint of arrays outputs two lines with '- elements:'
        /// metadata/lineParsers grabs the first - this grabs the second 
        const headerRegex = new RegExp(`- elements: ${metadata.elements.address}`);
        elementsListStartIndex = remainingLines.findIndex(line => line.match(headerRegex));
    }

    if (elementsListStartIndex !== -1) {
        // + 2 for start '{' and end '}' of elements declaration
        const elementLines = remainingLines.splice(elementsListStartIndex, metadata.elements.size + 2);
        value = elementLines
            .slice(1, -1) // 1. Get only the lines between '{' and '}'
            .map((line) => {
                const trimmedLine = line.trim();
                const colonIndex = trimmedLine.indexOf(':');
                if (colonIndex === -1) {
                    return trimmedLine; 
                }
                const lineValue = trimmedLine.substring(colonIndex + 1).trim();
                const tryNumber = Number(lineValue);
                return Number.isNaN(tryNumber) ? lineValue : tryNumber;
            });
    }

    // const other = remainingLines.join('\n');
    return { ...metadata, value, /*other*/ };
};

const parseFunction = (lines) => {
    const { metadata, remainingLines } = parseMetadata(lines, [
        'map', 'prototype', 'functionPrototype', 'sharedInfo', 'name', 
        'formalParameterCount', 'code', 'invocationCount', 'kind'
    ]);

    let sourceCode = '', properties = [], slots = [], other = [];
    
    for (let i = 0; i < remainingLines.length; i++) {
        const line = remainingLines[i];

        if (line.trim().startsWith('- source code:')) {
            let sourceCodeLines = [];
            i++;
            while (i < remainingLines.length && !remainingLines[i].trim().startsWith('- ')) {
                sourceCodeLines.push(remainingLines[i]);
                i++;
            }
            sourceCode = sourceCodeLines.join('\n').trim();
        } else if (line.trim().startsWith('- All own properties')) {
            i++;
            while (i < remainingLines.length && !remainingLines[i].trim().startsWith('}')) {
                properties.push(remainingLines[i].trim());
                i++;
            }
        } else if (line.trim().startsWith('- slot #')) {
            const slotRegex = /- slot #([0-9]+) (\w+) (\w+)/;
            const match = line.match(slotRegex);
            if(match) {
                const slot = {
                    number: parseInt(match[1], 10),
                    type: match[2],
                    state: match[3], // MONOMORPHIC or POLYMORPHIC
                    details: []
                };
                i++; 
                while (i < remainingLines.length && (remainingLines[i].startsWith('   ') || remainingLines[i].trim() === '{' || remainingLines[i].trim() === '}')) {
                    slot.details.push(remainingLines[i].trim());
                    i++;
                }
                slots.push(slot);
            }
        } else {
            other.push(line);
        }
    }

    // other = other.join('\n').trim();
    return { ...metadata, sourceCode, properties, slots,  /*other*/ };
};


const DebugPrintBlock = (lines) => {
    if(!lines.length){
         return 'No Lines';
    }
    let firstMatch, firstLine;
    for(let i = 0; i < lines.length; i++){
        const line = lines[i];
        const match = line.match(memoryAddressAndTypeRegex);
        if (!match) {
            continue;
        }
        else{
            firstLine = line
            firstMatch = match
            lines.splice(0, i);
            break;
        }
    }
    if (!firstMatch) {
        throw new Error(`Invalid DebugPrint format: "${firstLine}"`);
    }
    const memoryAddress = firstMatch[1];
    let type = firstMatch[2];
    let nestedContent = {};

    switch(type){
        case "[JSArray]":
            type = 'Array';
            nestedContent = parseArray(lines);
            break;
        case "[Function]":
            type = 'Function';
            nestedContent = parseFunction(lines);
            break;
    }

    return { memoryAddress, type, ...nestedContent };
}

export default DebugPrintBlock;