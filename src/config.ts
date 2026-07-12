import * as vscode from 'vscode';

export interface Config {
  pathStyle: 'relative' | 'absolute';
  showNotifications: boolean;
  directPush: boolean;
}

export function getConfig(): Config {
  const cfg = vscode.workspace.getConfiguration('claude-context');
  return {
    pathStyle: cfg.get<'relative' | 'absolute'>('pathStyle') ?? 'relative',
    showNotifications: cfg.get<boolean>('showNotifications') ?? true,
    directPush: cfg.get<boolean>('directPush') ?? true,
  };
}
