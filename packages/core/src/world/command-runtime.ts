import { $internal } from '../common';
import type { World } from './world';
import type { CommandBuffer } from './command-buffer';
import { clearCommandBuffer } from './command-buffer';

type WorldInternal = {
	commandBuffer: CommandBuffer;
	interpretCommands: (buf: CommandBuffer) => void;
};

export function flushCommands(world: World): void {
	const ctx = (world as any)[$internal] as WorldInternal;
	if (!ctx.commandBuffer) return;
	if (ctx.commandBuffer.write === 0) return;
	ctx.interpretCommands(ctx.commandBuffer);
	clearCommandBuffer(ctx.commandBuffer);
}
