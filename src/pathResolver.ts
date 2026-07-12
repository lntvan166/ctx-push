export function resolvePath(
  absolutePath: string,
  workspaceRoot: string | undefined,
  pathStyle: 'relative' | 'absolute'
): string {
  if (pathStyle === 'relative' && workspaceRoot) {
    for (const sep of ['/', '\\']) {
      if (absolutePath.startsWith(workspaceRoot + sep)) {
        return absolutePath.slice(workspaceRoot.length + 1).split('\\').join('/');
      }
    }
  }
  return absolutePath;
}

// Claude Code tokenizes @refs at whitespace; escaping keeps paths with
// spaces (or the rare tab) intact
function escapeSpaces(path: string): string {
  return path.replace(/([ \t])/g, '\\$1');
}

export function formatSelection(path: string, startLine: number, endLine: number): string {
  return `@${escapeSpaces(path)}:${startLine}-${endLine}`;
}

export function formatPath(path: string): string {
  return `@${escapeSpaces(path)}`;
}

// A full-line selection (Shift+Down, gutter drag) parks the cursor at column 0
// of the line after the selection — that line isn't part of the selection
export function selectionLineRange(
  startLine: number,
  endLine: number,
  endCharacter: number
): { start: number; end: number } {
  const end = endCharacter === 0 && endLine > startLine ? endLine : endLine + 1;
  return { start: startLine + 1, end };
}
