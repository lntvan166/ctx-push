// A structured file reference for the IDE bridge. fsPath is ABSOLUTE —
// the Claude CLI relativizes against its own cwd and renders @path#L10-20.
export interface Ref {
  fsPath: string;
  lineStart?: number;
  lineEnd?: number;
}
