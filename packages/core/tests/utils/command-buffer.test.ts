import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandBuffer, type Command } from '../../src/utils/command-buffer';

describe('CommandBuffer', () => {
	let buffer: CommandBuffer;

	beforeEach(() => {
		buffer = new CommandBuffer();
	});

	it('should enqueue and execute commands in order', () => {
		const executionOrder: number[] = [];
		const command1: Command = { execute: () => executionOrder.push(1) };
		const command2: Command = { execute: () => executionOrder.push(2) };

		buffer.enqueue(command1);
		buffer.enqueue(command2);
		expect(buffer.length).toBe(2);

		buffer.flush();

		expect(executionOrder).toEqual([1, 2]);
		expect(buffer.isEmpty).toBe(true);
	});

	it('should clear commands without executing them', () => {
		const command = { execute: vi.fn() };

		buffer.enqueue(command);
		buffer.clear();

		expect(buffer.isEmpty).toBe(true);
		expect(command.execute).not.toHaveBeenCalled();
	});

	it('should handle empty buffer', () => {
		expect(buffer.isEmpty).toBe(true);
		expect(buffer.length).toBe(0);
		expect(() => buffer.flush()).not.toThrow();
	});
});
