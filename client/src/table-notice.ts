import { wrapText } from './menu-layout';

/** Bounded table notices keep errors out of the navigation and statistics row. */
export function tableNoticeLayout(
  message: string,
  mobile: boolean,
  warning: boolean,
  classic: boolean,
  measure?: (text: string, size: number) => number,
  panelWidth = 388,
) {
  if (classic) {
    // Errors temporarily replace the right side of the personal bar.
    // Keep the public cards and the private hand visible.
    const widthOf =
      measure ?? ((text: string, size: number) => (text.length * size) / 2);
    const width = panelWidth;
    let size = 16;
    let lines: string[] = [];
    const wrap = (): string[] => {
      const result: string[] = [];
      let line = '';
      for (const word of message.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && widthOf(next, size) > width - 24) {
          result.push(line);
          line = word;
        } else line = next;
      }
      result.push(line);
      return result;
    };
    do {
      lines = wrap();
      if (lines.length * (size + 3) <= 76 || size <= 12) break;
      size -= 1;
    } while (size >= 12);
    const lineHeight = size + 3;
    return {
      x: width === 388 ? 556 : 936 - width,
      y: 438,
      w: width,
      h: 88,
      size,
      lineHeight,
      lines,
    };
  }
  const size = mobile && warning ? 10 : 8;
  const lines = wrapText(message, Math.floor((600 - 24) / size));
  const lineHeight = size + 6;
  const w = Math.max(
    48,
    Math.max(...lines.map((line) => line.length)) * size + 24,
  );
  return {
    x: Math.floor((960 - w) / 2),
    y: warning ? 212 : 44,
    w,
    h: Math.max(24, (lines.length - 1) * lineHeight + size + 12),
    size,
    lineHeight,
    lines,
  };
}
