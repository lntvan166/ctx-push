export function resolvePath(
  absolutePath: string,
  workspaceRoot: string | undefined,
  pathStyle: 'relative' | 'absolute'
): string {
  if (pathStyle === 'relative' && workspaceRoot && absolutePath.startsWith(workspaceRoot + '/')) {
    return absolutePath.slice(workspaceRoot.length + 1);
  }
  return absolutePath;
}

export function formatSelection(path: string, startLine: number, endLine: number): string {
  return `@${path}:${startLine}-${endLine}`;
}

export function formatPath(path: string): string {
  return `@${path}`;
}
