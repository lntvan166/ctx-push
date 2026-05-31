const vscode = {
  workspace: {
    getConfiguration: jest.fn().mockReturnValue({
      get: jest.fn(),
    }),
    workspaceFolders: undefined as any,
  },
  window: {
    activeTextEditor: undefined as any,
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
  },
  commands: {
    registerCommand: jest.fn(),
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
};

export = vscode;
