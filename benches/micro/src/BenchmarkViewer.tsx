import { createContext, useContext, useState } from 'react';

interface LogNodeData {
  id: number;
  key: string;
  type: string;
  children: LogNodeData[];
  content: any;
}

interface BenchmarkContextType {
  selectedAddress: string | null;
  setSelectedAddress: (address: string | null) => void;
}

const BenchmarkContext = createContext<BenchmarkContextType | undefined>(
  undefined,
);

// Custom hook for easy context access
const useBenchmarkContext = () => {
  const context = useContext(BenchmarkContext);
  if (!context) {
    throw new Error(
      'useBenchmarkContext must be used within a BenchmarkViewer',
    );
  }
  return context;
};

export function BenchmarkViewer({ data }: { data: LogNodeData[] }) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  return (
    <BenchmarkContext.Provider value={{ selectedAddress, setSelectedAddress }}>
      <div className="font-sans bg-gray-900 text-gray-100 p-4">
        {data.map((rootNode) => (
          <LogBlock key={rootNode.id} node={rootNode} />
        ))}
      </div>
    </BenchmarkContext.Provider>
  );
}

// --- 3. THE RECURSIVE BLOCK COMPONENT ---

/**
 * Recursively renders a single log node and its children.
 * Handles collapsing and indentation.
 */
function LogBlock({ node, depth = 0 }: { node: LogNodeData; depth?: number }) {
  // Top-level nodes (MicroBench) are not collapsible
  const isCollapsible = depth > 0;
  // Default to being open, except for "Post Bench" which is often less critical
  const [isCollapsed, setIsCollapsed] = useState(
    isCollapsible && node.type === 'Post Bench',
  );

  const indentStyle = { paddingLeft: `${depth * 1.5}rem` };

  return (
    <div
      className={`border-l-2 ${
        depth === 0
          ? 'border-transparent'
          : 'border-gray-700/50 hover:border-gray-600'
      }`}
    >
      {/* Header Row */}
      <div
        className={`flex items-center space-x-2 py-2 sticky top-0 bg-gray-900 z-10 ${
          isCollapsible ? 'cursor-pointer' : ''
        }`}
        style={indentStyle}
        onClick={() => isCollapsible && setIsCollapsed(!isCollapsed)}
      >
        {isCollapsible ? (
          isCollapsed ? (
            <span className="text-gray-500 w-4 inline-block text-center">►</span>
          ) : (
            <span className="text-gray-500 w-4 inline-block text-center">▼</span>
          )
        ) : (
          // Use a different icon for the root
          <span className="text-cyan-400 w-4 inline-block text-center">📦</span>
        )}
        <span className="font-bold text-lg text-white">{node.key}</span>
        <span className="text-sm font-mono text-gray-400">({node.type})</span>
      </div>

      {/* Content & Children */}
      {!isCollapsed && (
        <div className="pb-2">
          {/* Render this node's specific content */}
          <div style={indentStyle} className="pl-6">
            <NodeContent node={node} />
          </div>

          {/* Render children recursively */}
          {node.children && node.children.length > 0 && (
            <div className="mt-1">
              {node.children.map((childNode) => (
                <LogBlock
                  key={childNode.id}
                  node={childNode}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NodeContent({ node }: { node: LogNodeData }) {
  // Simple content types
  if (typeof node.content === 'string') {
    return (
      <pre className="text-sm text-gray-300 whitespace-pre-wrap">
        {node.content}
      </pre>
    );
  }

  // Object content types
  switch (node.type) {
    case 'DebugPrint':
      return <DebugPrintContent content={node.content} />;
    case 'Run Bench':
      return <RunBenchContent content={node.content} />;
    case 'MicroBench':
      return <MicroBenchSummary content={node.content} />;
    case 'RunOptStatus':
      return (
        <pre className="text-xs font-mono bg-gray-800 p-2 rounded text-gray-400">
          {node.content}
        </pre>
      );
    // 'Setup Bench', 'First Bench', 'Post Bench', 'RunKey' often have
    // simple 'label' content or just a string, which is handled above.
    // We add a fallback for any other complex objects.
    default:
      if (node.content?.type === 'label') {
        return null; // Don't render simple labels
      }
      return (
        <pre className="text-xs bg-gray-800 p-2 rounded text-gray-400">
          {JSON.stringify(node.content, null, 2)}
        </pre>
      );
  }
}

function ArrayValueViewer({ value }: { value: any[] | undefined }) {
  const [searchTerm, setSearchTerm] = useState('');

  if (!Array.isArray(value)) {
    return null;
  }

  const filteredValue = value
    .map((item, index) => ({ value: String(item), index })) // Keep index for context
    .filter((item) =>
      item.value.toLowerCase().includes(searchTerm.toLowerCase()),
    );

  const itemsToShow = filteredValue.slice(0, 100); // Limit to 100 matches

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200">
        Show Full Value ({value.length} items)
      </summary>
      <div className="bg-gray-900/50 p-2 rounded mt-1">
        <input
          type="text"
          placeholder={`Search ${value.length} items...`}
          className="w-full bg-gray-700 text-gray-100 p-1.5 rounded border border-gray-600 text-sm sticky top-0"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onClick={(e) => e.stopPropagation()} // Prevent details from toggling on click
        />
        <pre className="text-xs mt-2 max-h-64 overflow-y-auto">
          {itemsToShow.length > 0 ? (
            itemsToShow.map((item) => (
              <div key={item.index}>
                <span className="text-gray-500 select-none">
                  {String(item.index).padStart(5, ' ')}:
                </span>{' '}
                {item.value}
              </div>
            ))
          ) : (
            <span className="text-gray-500 italic">No matching items.</span>
          )}
          {filteredValue.length > itemsToShow.length && (
            <div className="text-gray-500 italic mt-1">
              ...and {filteredValue.length - itemsToShow.length} more (omitted
              for performance)
            </div>
          )}
        </pre>
      </div>
    </details>
  );
}

function DebugPrintContent({ content }: { content: any }) {
  const { selectedAddress, setSelectedAddress } = useBenchmarkContext();

  const memAddr = content.memoryAddress;
  if (!memAddr) return null;

  const isHighlighted = selectedAddress === memAddr;

  const handleAddressClick = () => {
    // Toggle selection
    setSelectedAddress(isHighlighted ? null : memAddr);
  };

  const { type } = content;

  // --- Helper function to render the body based on type ---
  const renderContentBody = () => {
    if (type === 'Function') {
      const otherDetails = { ...content };
      delete otherDetails.memoryAddress;
      delete otherDetails.type;
      delete otherDetails.map;
      delete otherDetails.elements;
      delete otherDetails.sourceCode;
      delete otherDetails.slots;
      const hasOtherDetails = Object.keys(otherDetails).length > 0;

      return (
        <>
          {/* V8-specific info */}
          <div className="space-y-1 text-sm font-mono mb-3">
            {content.map?.elementsType && (
              <div className="flex items-center space-x-2">
                <span className="text-gray-400">Map Elements:</span>
                <ElementsKindTag kind={content.map.elementsType} />
              </div>
            )}
          </div>

          {/* Collapsible full JSON details */}
          <details>
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300">
              Show full details
            </summary>
            <div className="space-y-1 p-4 text-sm font-mono mb-3">
              {content.sourceCode && (
                <details className="mb-2">
                  <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200">
                    Show Source Code
                  </summary>
                  <pre className="text-xs bg-gray-900 p-2 rounded mt-1 overflow-x-auto whitespace-pre-wrap">
                    {content.sourceCode}
                  </pre>
                </details>
              )}

              {/* Other Details */}
              {hasOtherDetails && (
                <>
                  <div className="text-xs text-gray-400 mt-2">
                    Other Details:
                  </div>
                  <pre className="text-xs bg-gray-900/50 p-2 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(otherDetails, null, 2)}
                  </pre>
                </>
              )}
              {/* Nested Slots Toggle */}
              {content.slots && Array.isArray(content.slots) && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200">
                    Show Slots ({content.slots.length})
                  </summary>
                  <pre className="text-xs bg-gray-900/50 p-2 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(content.slots, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </details>
        </>
      );
    }

    if (type === 'Array') {
      const otherDetails = { ...content };
      delete otherDetails.value; // The new raw value key
      const hasOtherDetails = Object.keys(otherDetails).length > 0;

      return (
        <>
          {/* V8-specific info */}
          <div className="space-y-1 text-sm font-mono mb-3">
            {content.elements?.elementsKind && (
              <div className="flex items-center space-x-2">
                <span className="text-gray-400">Elements Kind:</span>
                <ElementsKindTag kind={content.elements.elementsKind} />
              </div>
            )}
            {content.map?.elementsType && (
              <div className="flex items-center space-x-2">
                <span className="text-gray-400">Map Elements:</span>
                <ElementsKindTag kind={content.map.elementsType} />
              </div>
            )}
          </div>

          {/* Collapsible full JSON details */}
          <details>
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300">
              Show full details
            </summary>

            <div className="space-y-1 p-4 text-sm font-mono mb-3">
              {/* Other Details */}
              {hasOtherDetails && (
                <>
                  <div className="text-xs text-gray-400 mt-2">
                    Other Details:
                  </div>
                  <pre className="text-xs bg-gray-900/50 p-2 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(otherDetails, null, 2)}
                  </pre>
                </>
              )}

              {/* Nested Value Toggle */}
              <ArrayValueViewer value={content.value} />
            </div>
          </details>
        </>
      );
    }

    // Default renderer for other types
    return (
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300">
          Show full details
        </summary>
        <pre className="text-xs bg-gray-900 p-2 rounded mt-1 overflow-x-auto">
          {JSON.stringify(content, null, 2)}
        </pre>
      </details>
    );
  };

  return (
    <div
      className={`bg-gray-800 p-3 rounded-lg border ${
        isHighlighted
          ? 'border-blue-500 ring-2 ring-blue-500/50'
          : 'border-gray-700'
      } transition-all duration-150`}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center space-x-2">
          {type === 'Function' ? (
            <span className="text-purple-400 w-4 inline-block text-center text-lg italic font-bold">
              ƒ
            </span>
          ) : type === 'Array' ? (
            <span className="text-green-400 w-4 inline-block text-center">
              📦
            </span>
          ) : (
            <span className="text-gray-400 w-4 inline-block text-center">
              •
            </span>
          )}
          <span className="text-sm font-semibold text-white">
            {content.type}
          </span>
        </div>
        <MemoryAddress
          address={memAddr}
          isHighlighted={isHighlighted}
          onClick={handleAddressClick}
        />
      </div>

      {/* Render the appropriate body */}
      {renderContentBody()}
    </div>
  );
}

function RunBenchContent({ content }: { content: any }) {
  const deopts = content?.trace?.deopts;

  if (deopts && deopts.length > 0) {
    return (
      <div className="space-y-2">
        {deopts.map((deopt: string[], index: number) => (
          <DeoptLog key={index} deoptData={deopt} />
        ))}
      </div>
    );
  }

  if (content === 'No Lines') {
    return <p className="text-sm text-gray-500 italic">No trace lines.</p>;
  }

  // Fallback
  return (
    <pre className="text-xs bg-gray-800 p-2 rounded text-gray-400">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}

/**
 * Renders a single, highly-visible Deopt log.
 */
function DeoptLog({ deoptData }: { deoptData: string[] }) {
  const { selectedAddress, setSelectedAddress } = useBenchmarkContext();

  // Deconstruct the deopt data based on the JSON sample
  const [log, type, reason, address] = deoptData;
  if (!address) return null; // Not a valid deopt log

  const isHighlighted = selectedAddress === address;

  const handleAddressClick = () => {
    setSelectedAddress(isHighlighted ? null : address);
  };

  return (
    <div
      className={`border-l-4 p-3 rounded-r-lg ${
        isHighlighted
          ? 'border-red-400 bg-red-900/70 ring-2 ring-blue-500'
          : 'border-red-500 bg-red-900/50'
      } transition-all duration-150`}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-red-400 text-lg">⚠️</span>
          <span className="font-bold text-lg text-red-200">
            DEOPTIMIZATION
          </span>
        </div>
        <span className="text-sm font-semibold bg-red-200 text-red-900 px-2 py-0.5 rounded-full">
          {reason}
        </span>
      </div>

      <div className="font-mono text-sm text-red-100">
        <div className="flex items-center space-x-2">
          <span>Function:</span>
          <MemoryAddress
            address={address}
            isHighlighted={isHighlighted}
            onClick={handleAddressClick}
            className="text-red-100 bg-red-800/50 hover:bg-red-700/50"
          />
        </div>
        <div className="mt-2">
          <span className="text-red-300">Type:</span> {type}
        </div>
      </div>
      <pre className="text-xs text-red-200/80 mt-2 bg-black/20 p-2 rounded">
        {log}
      </pre>
    </div>
  );
}

function MicroBenchSummary({ content }: { content: any }) {
  const results = content?.results;
  if (!results || !Array.isArray(results)) return null;

  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <h3 className="text-lg font-semibold text-white mb-2 flex items-center">
        <span className="mr-2 text-cyan-400 text-lg">📄</span>
        Benchmark Results
      </h3>
      <pre className="font-mono text-sm text-gray-200 bg-gray-900 p-3 rounded overflow-x-auto">
        {results.join('\n')}
      </pre>
    </div>
  );
}

// --- 6. UI HELPER COMPONENTS ---

/**
 * A small, color-coded tag for V8 element kinds.
 */
function ElementsKindTag({ kind }: { kind: string | undefined }) {
  if (!kind) return null;

  let colors = 'bg-gray-500 text-gray-100'; // Default
  if (kind.includes('SMI')) {
    colors = 'bg-green-600 text-green-100'; // Good
  } else if (kind.includes('PACKED_ELEMENTS')) {
    colors = 'bg-yellow-600 text-yellow-100'; // Less performant
  } else if (kind.includes('HOLEY')) {
    colors = 'bg-red-600 text-red-100'; // Bad
  }

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-bold ${colors}`}
    >
      {kind}
    </span>
  );
}

/**
 * A standardized, clickable Memory Address component.
 */
function MemoryAddress({
  address,
  isHighlighted,
  onClick,
  className = '',
}: {
  address: string;
  isHighlighted: boolean;
  onClick: () => void;
  className?: string;
}) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(address);
    // You could add a small "Copied!" toast here
  };

  return (
    <div
      className={`group flex items-center rounded font-mono text-sm ${
        isHighlighted
          ? 'bg-blue-600 text-blue-100'
          : 'bg-gray-700 text-gray-300'
      } ${className}`}
    >
      <button
        onClick={onClick}
        title="Click to highlight all instances"
        className={`px-2 py-0.5 rounded-l ${
          isHighlighted ? 'hover:bg-blue-500' : 'hover:bg-gray-600'
        } transition-colors`}
      >
        {address}
      </button>
      <button
        onClick={copyToClipboard}
        title="Copy to clipboard"
        className={`px-1.5 py-0.5 border-l ${
          isHighlighted
            ? 'border-blue-500 hover:bg-blue-500'
            : 'border-gray-600 hover:bg-gray-600'
        } rounded-r opacity-50 group-hover:opacity-100 transition-all flex items-center justify-center`}
      >
        <span className="text-xs">📋</span>
      </button>
    </div>
  );
}