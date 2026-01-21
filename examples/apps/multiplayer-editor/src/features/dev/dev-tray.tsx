import { useState } from 'react';
import { useWorld, useTrait } from 'koota/react';
import { History } from '../../core/traits';
import { formatOp } from '../../utils/format-ops';

export function DevTray() {
    const [isOpen, setIsOpen] = useState(false);
    const world = useWorld();
    const history = useTrait(world, History);

    if (!history) return null;

    const totalOps = history.undoStack.flat().length;
    const pendingCount = history.pending.length;
    const undoCount = history.undoStack.length;
    const redoCount = history.redoStack.length;

    return (
        <>
            {/* Toggle button */}
            <button
                className="dev-tray-toggle"
                onClick={() => setIsOpen(!isOpen)}
                title="Toggle ops dev tray"
            >
                {isOpen ? '▼' : '◀'} Ops ({totalOps})
            </button>

            {/* Tray panel */}
            {isOpen && (
                <div className="dev-tray">
                    <div className="dev-tray-header">
                        <h3>Operations</h3>
                        <div className="dev-tray-stats">
                            <span>Next Seq: {history.nextSeq}</span>
                            <span>Next ID: {history.nextId}</span>
                            <span>Entities: {history.entities.size}</span>
                        </div>
                    </div>

                    <div className="dev-tray-content">
                        {/* Pending ops */}
                        {pendingCount > 0 && (
                            <div className="dev-tray-section">
                                <h4>Pending ({pendingCount})</h4>
                                <div className="dev-tray-ops">
                                    {history.pending.map((op, i) => (
                                        <div key={i} className="dev-tray-op pending">
                                            {formatOp(op)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Undo stack */}
                        {undoCount > 0 && (
                            <div className="dev-tray-section">
                                <h4>Undo Stack ({undoCount} batches)</h4>
                                <div className="dev-tray-batches">
                                    {[...history.undoStack].reverse().map((batch, batchIdx) => (
                                        <div key={batchIdx} className="dev-tray-batch">
                                            <div className="dev-tray-batch-header">
                                                Batch {undoCount - batchIdx} ({batch.length} ops)
                                            </div>
                                            <div className="dev-tray-ops">
                                                {batch.map((op, opIdx) => (
                                                    <div key={opIdx} className="dev-tray-op">
                                                        {formatOp(op)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Redo stack */}
                        {redoCount > 0 && (
                            <div className="dev-tray-section">
                                <h4>Redo Stack ({redoCount} batches)</h4>
                                <div className="dev-tray-batches">
                                    {[...history.redoStack].reverse().map((batch, batchIdx) => (
                                        <div key={batchIdx} className="dev-tray-batch">
                                            <div className="dev-tray-batch-header">
                                                Batch {redoCount - batchIdx} ({batch.length} ops)
                                            </div>
                                            <div className="dev-tray-ops">
                                                {batch.map((op, opIdx) => (
                                                    <div key={opIdx} className="dev-tray-op">
                                                        {formatOp(op)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Empty state */}
                        {totalOps === 0 && pendingCount === 0 && (
                            <div className="dev-tray-empty">
                                No operations yet. Create or modify shapes to see ops.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
import { useState } from 'react';
import { useWorld, useTrait } from 'koota/react';
import { History } from '../../core/traits';
import { formatOp } from '../../utils/format-ops';

export function DevTray() {
    const [isOpen, setIsOpen] = useState(false);
    const world = useWorld();
    const history = useTrait(world, History);

    if (!history) return null;

    const totalOps = history.undoStack.flat().length;
    const pendingCount = history.pending.length;
    const undoCount = history.undoStack.length;
    const redoCount = history.redoStack.length;

    return (
        <>
            {/* Toggle button */}
            <button
                className="dev-tray-toggle"
                onClick={() => setIsOpen(!isOpen)}
                title="Toggle ops dev tray"
            >
                {isOpen ? '▼' : '◀'} Ops ({totalOps})
            </button>

            {/* Tray panel */}
            {isOpen && (
                <div className="dev-tray">
                    <div className="dev-tray-header">
                        <h3>Operations</h3>
                        <div className="dev-tray-stats">
                            <span>Next Seq: {history.nextSeq}</span>
                            <span>Next ID: {history.nextId}</span>
                            <span>Entities: {history.entities.size}</span>
                        </div>
                    </div>

                    <div className="dev-tray-content">
                        {/* Pending ops */}
                        {pendingCount > 0 && (
                            <div className="dev-tray-section">
                                <h4>Pending ({pendingCount})</h4>
                                <div className="dev-tray-ops">
                                    {history.pending.map((op, i) => (
                                        <div key={i} className="dev-tray-op pending">
                                            {formatOp(op)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Undo stack */}
                        {undoCount > 0 && (
                            <div className="dev-tray-section">
                                <h4>Undo Stack ({undoCount} batches)</h4>
                                <div className="dev-tray-batches">
                                    {[...history.undoStack].reverse().map((batch, batchIdx) => (
                                        <div key={batchIdx} className="dev-tray-batch">
                                            <div className="dev-tray-batch-header">
                                                Batch {undoCount - batchIdx} ({batch.length} ops)
                                            </div>
                                            <div className="dev-tray-ops">
                                                {batch.map((op, opIdx) => (
                                                    <div key={opIdx} className="dev-tray-op">
                                                        {formatOp(op)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Redo stack */}
                        {redoCount > 0 && (
                            <div className="dev-tray-section">
                                <h4>Redo Stack ({redoCount} batches)</h4>
                                <div className="dev-tray-batches">
                                    {[...history.redoStack].reverse().map((batch, batchIdx) => (
                                        <div key={batchIdx} className="dev-tray-batch">
                                            <div className="dev-tray-batch-header">
                                                Batch {redoCount - batchIdx} ({batch.length} ops)
                                            </div>
                                            <div className="dev-tray-ops">
                                                {batch.map((op, opIdx) => (
                                                    <div key={opIdx} className="dev-tray-op">
                                                        {formatOp(op)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Empty state */}
                        {totalOps === 0 && pendingCount === 0 && (
                            <div className="dev-tray-empty">
                                No operations yet. Create or modify shapes to see ops.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
