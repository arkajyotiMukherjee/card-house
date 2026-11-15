import { wrapText } from './menu-layout';

/** The finished-game notice occupies the empty action margin, clear of result hands. */
export function resultNoticeLayout(text: string, mobile: boolean) {
  let size = mobile ? 12 : 10;
  let lines = wrapText(text, Math.floor(184 / size));
  while (lines.length * (size + 4) + 16 > 92 && size > 8) {
    size--;
    lines = wrapText(text, Math.floor(184 / size));
  }
  return {
    size,
    lines,
    width: 200,
    height: lines.length * (size + 4) + 16,
    lineHeight: size + 4,
  };
}
