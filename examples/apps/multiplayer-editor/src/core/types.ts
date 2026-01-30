export const enum OpCode {
    CreateShape = 1,
    DeleteShape = 2,
    UpdatePosition = 3,
    UpdateRotation = 4,
    UpdateScale = 5,
    UpdateColor = 6,
}

// Sentinel value for unassigned sequence numbers
export const SEQ_UNASSIGNED = 0;

export type RGB = { r: number; g: number; b: number };

export type Op =
    | {
          op: OpCode.CreateShape;
          id: number; // Stable entity ID
          seq: number;
          shape: 'rect' | 'ellipse';
          x: number;
          y: number;
          color: RGB;
          rotation: number;
          scaleX: number;
          scaleY: number;
      }
    | {
          op: OpCode.DeleteShape;
          id: number;
          seq: number;
          shape: 'rect' | 'ellipse';
          x: number;
          y: number;
          color: RGB;
          rotation: number;
          scaleX: number;
          scaleY: number;
      }
    | {
          op: OpCode.UpdatePosition;
          id: number;
          seq: number;
          x: number;
          y: number;
          prevX: number;
          prevY: number;
      }
    | {
          op: OpCode.UpdateRotation;
          id: number;
          seq: number;
          angle: number;
          prevAngle: number;
      }
    | {
          op: OpCode.UpdateScale;
          id: number;
          seq: number;
          x: number;
          y: number;
          prevX: number;
          prevY: number;
      }
    | {
          op: OpCode.UpdateColor;
          id: number;
          seq: number;
          r: number;
          g: number;
          b: number;
          prevR: number;
          prevG: number;
          prevB: number;
      };

export type HistoryEntry = {
    intent: Op[]; // Original user ops (preserved across round-trips)
    restoreTo: Op[]; // Snapshot to restore to (updated each undo/redo)
};
