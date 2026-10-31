/**
 * Normalizes program output so that harmless whitespace differences
 * (Windows line endings, trailing spaces, trailing blank lines) don't
 * cause a Wrong Answer. Everything else must match exactly.
 */
export function normalizeOutput(output: string): string {
  return output
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

export function outputsMatch(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}
