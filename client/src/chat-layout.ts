import { wrapText } from './menu-layout';

export const CHAT_TEXT = {
  desktop: { size: 10, lineHeight: 22 },
  phone: { size: 12, lineHeight: 24 },
} as const;

type ChatDisplayLine = {
  sender: string;
  indent: number;
  body: string;
};

/** Keep the message aligned under its first line, after the sender label. */
export function wrapChatLines(
  name: string,
  body: string,
  columns: number,
): ChatDisplayLine[] {
  const nameLimit = Math.min(20, Math.floor(columns / 3));
  const sender =
    name.length > nameLimit ? `${name.slice(0, nameLimit - 3)}...` : name;
  const prefix = sender ? `${sender}: ` : '';
  return wrapText(body, columns - prefix.length).map((text, index) => ({
    sender: index === 0 ? prefix : '',
    indent: prefix.length,
    body: text,
  }));
}
