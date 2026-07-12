import * as vscode from 'vscode';
import { getConfig } from '../config';
import { resolvePath, formatSelection, formatPath, selectionLineRange } from '../pathResolver';
import { pushReference } from '../pushReference';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { BridgeProvider } from '../ideBridge';
import { Ref } from '../ref';

export async function addSelectionWithMode(
  buffer: ContextBuffer,
  history: History,
  mode: 'replace' | 'append',
  getBridge?: BridgeProvider
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active file open');
    return;
  }
  if (editor.document.isUntitled || editor.document.uri.scheme !== 'file') {
    vscode.window.showErrorMessage('Save the file first — unsaved buffers have no path to reference');
    return;
  }
  const config = getConfig();
  const absolutePath = editor.document.uri.fsPath;
  const workspaceRoot = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath;
  const resolvedPath = resolvePath(absolutePath, workspaceRoot, config.pathStyle);
  const selection = editor.selection;
  const { start, end } = selectionLineRange(
    selection.start.line,
    selection.end.line,
    selection.end.character
  );
  const reference = selection.isEmpty
    ? formatPath(resolvedPath)
    : formatSelection(resolvedPath, start, end);
  const ref: Ref = selection.isEmpty
    ? { fsPath: absolutePath }
    : { fsPath: absolutePath, lineStart: start, lineEnd: end };
  await pushReference(reference, config, buffer, history, mode, { ref, bridge: getBridge?.() });
}

export async function addSelection(
  buffer: ContextBuffer,
  history: History,
  getBridge?: BridgeProvider
): Promise<void> {
  await addSelectionWithMode(buffer, history, 'replace', getBridge);
}
