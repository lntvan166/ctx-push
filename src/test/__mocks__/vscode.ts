class EventEmitter<T> {
  private readonly listeners: Array<(e: T) => void> = [];

  readonly event = (listener: (e: T) => void): { dispose: () => void } => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const i = this.listeners.indexOf(listener);
        if (i >= 0) this.listeners.splice(i, 1);
      },
    };
  };

  fire(data: T): void {
    this.listeners.forEach(l => l(data));
  }

  dispose(): void {
    this.listeners.length = 0;
  }
}

const vscode = {
  EventEmitter,
  env: {
    clipboard: {
      writeText: jest.fn().mockResolvedValue(undefined),
    },
  },
  workspace: {
    getConfiguration: jest.fn().mockReturnValue({ get: jest.fn() }),
    workspaceFolders: undefined as any,
  },
  window: {
    activeTextEditor: undefined as any,
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showQuickPick: jest.fn(),
    setStatusBarMessage: jest.fn(),
    withProgress: jest.fn().mockResolvedValue(undefined),
    createStatusBarItem: jest.fn().mockReturnValue({
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
      text: '',
      tooltip: '',
      command: '',
    }),
  },
  commands: {
    registerCommand: jest.fn(),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
  StatusBarAlignment: { Right: 1, Left: 0 },
  ProgressLocation: { Notification: 15 },
};

export = vscode;
