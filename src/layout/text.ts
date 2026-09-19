/** Width of `text` in artwork units at the callout font size; bold for headings. */
export type Measure = (text: string, bold: boolean) => number;

/**
 * Greedy word wrap into lines no wider than `maxWidth`. Words longer than a line are
 * broken between characters. Used instead of foreignObject, which can taint the
 * export canvas in Safari.
 */
export function wrapText(text: string, maxWidth: number, measure: Measure, bold = false): string[] {
  const lines: string[] = [];
  let line = '';
  const push = () => {
    if (line) lines.push(line);
    line = '';
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, bold) <= maxWidth) {
      line = candidate;
      continue;
    }
    push();
    if (measure(word, bold) <= maxWidth) {
      line = word;
      continue;
    }
    // Break an over-long word.
    let part = '';
    for (const ch of word) {
      if (part && measure(part + ch, bold) > maxWidth) {
        lines.push(part);
        part = '';
      }
      part += ch;
    }
    line = part;
  }
  push();
  return lines;
}
