import * as vscode from 'vscode';

export async function copyReference(text: string): Promise<void> {
  await vscode.env.clipboard.writeText(text + ' ');
}
