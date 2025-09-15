export interface Command {
	execute(): void;
}

export class CommandBuffer {
	private commands: Command[] = [];

	enqueue(command: Command): void {
		this.commands.push(command);
	}

	flush(): void {
		const commandsToExecute = this.commands.slice();
		this.commands.length = 0;

		for (const command of commandsToExecute) {
			command.execute();
		}
	}

	get length(): number {
		return this.commands.length;
	}

	get isEmpty(): boolean {
		return this.commands.length === 0;
	}

	clear(): void {
		this.commands.length = 0;
	}
}
