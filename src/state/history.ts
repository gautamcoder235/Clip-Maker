export interface Command {
  name: string;
  execute(): void;
  undo(): void;
}

export class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory = 50;
  private onChangeCallbacks: (() => void)[] = [];

  push(command: Command) {
    command.execute();
    this.undoStack.push(command);
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
