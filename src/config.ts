import * as vscode from 'vscode';

export interface Config {
  tmuxSession: string;
  pathStyle: 'relative' | 'absolute';
}

export function getConfig(): Config {
  const cfg = vscode.workspace.getConfiguration('ctx-push');
  return {
    tmuxSession: cfg.get<string>('tmuxSession') ?? 'claude',
    pathStyle: cfg.get<'relative' | 'absolute'>('pathStyle') ?? 'relative',
  };
}
