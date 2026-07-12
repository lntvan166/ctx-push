// A structured file reference for the IDE bridge. fsPath is ABSOLUTE —
// the Claude CLI relativizes against its own cwd. lineStart/lineEnd are
// 0-BASED (the CLI adds 1 when rendering @path#L10-20 in the prompt).
export interface Ref {
  fsPath: string;
  lineStart?: number;
  lineEnd?: number;
}
