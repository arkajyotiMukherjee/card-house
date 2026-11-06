import { wrapText } from './menu-layout';

// Press Start 2P is drawn on an 8px grid. Integer multiples keep its
// strokes on whole canvas pixels before the viewport scales the scene.
export const CHAT_TEXT = {
  desktop: { size: 8, lineHeight: 22 },
  phone: { size: 16, lineHeight: 24 },
} as const;

type ChatDisplayLine = {
  sender: string;
  indent: number;
  body: string;
};

/** Wrap the message beneath its sender, using more room on narrow panels. */
export function wrapChatLines(
  name: string,
  body: string,
  columns: number,
): ChatDisplayLine[] {
  const narrow = columns < 28;
  const nameLimit = Math.min(
    20,
    narrow ? columns - 2 : Math.floor(columns / 3),
  );
  const sender =
    name.length > nameLimit ? `${name.slice(0, nameLimit - 3)}...` : name;
  const prefix = sender ? `${sender}: ` : '';
  const bodyColumns = columns - prefix.length;
  // In the narrow phone lobby, let long messages use the full panel width.
  if (sender && narrow && (body.length > bodyColumns || body.includes('\n'))) {
    return [
      { sender: prefix.trimEnd(), indent: 0, body: '' },
      ...wrapText(body, columns).map((text) => ({
        sender: '',
        indent: 0,
        body: text,
      })),
    ];
  }
  return wrapText(body, bodyColumns).map((text, index) => ({
    sender: index === 0 ? prefix : '',
    indent: prefix.length,
    body: text,
  }));
}
