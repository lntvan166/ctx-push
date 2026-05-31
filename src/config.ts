import * as vscode from 'vscode';

export interface Config {
  tmuxSession: string;
  pathStyle: 'relative' | 'absolute';
  showNotifications: boolean;
}

export function getConfig(): Config {
  const cfg = vscode.workspace.getConfiguration('claude-context');
  return {
    tmuxSession: cfg.get<string>('tmuxSession') ?? 'claude',
    pathStyle: cfg.get<'relative' | 'absolute'>('pathStyle') ?? 'relative',
    showNotifications: cfg.get<boolean>('showNotifications') ?? true,
  };
}
