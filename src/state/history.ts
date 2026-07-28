export interface Command {
  name: string;
  execute(): void;
  undo(): void;
}

class TransactionCommand implements Command {
  name: string;
  firstCommand: Command;
  lastCommand: Command;
  timestamp: number;

  constructor(first: Command) {
    this.name = first.name;
    this.firstCommand = first;
    this.lastCommand = first;
    this.timestamp = Date.now();
  }
  execute() {
    this.lastCommand.execute();
  }
  undo() {
    this.firstCommand.undo();
  }
}

export class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory = 50;
  private onChangeCallbacks: (() => void)[] = [];
  private coalesceWindowMs = 1000;

  push(command: Command) {
    const now = Date.now();
    const lastCmd = this.undoStack[this.undoStack.length - 1];

    if (lastCmd && lastCmd instanceof TransactionCommand && lastCmd.name === command.name && (now - lastCmd.timestamp) < this.coalesceWindowMs) {
      lastCmd.lastCommand = command;
      lastCmd.timestamp = now;
      command.execute();
      this.notify();
      return;
    }

    const txCmd = new TransactionCommand(command);
    txCmd.execute();
    this.undoStack.push(txCmd);
    this.redoStack = []; // clear redo stack on new action

    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    
    this.notify();
  }

  undo() {
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
      this.notify();
    }
  }

  redo() {
    const command = this.redoStack.pop();
    if (command) {
      command.execute();
      this.undoStack.push(command);
      this.notify();
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  subscribe(callback: () => void) {
    this.onChangeCallbacks.push(callback);
  }

  private notify() {
    for (const callback of this.onChangeCallbacks) {
      callback();
    }
  }
}
