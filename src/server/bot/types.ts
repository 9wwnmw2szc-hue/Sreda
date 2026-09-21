/** Reply keyboard button: plain label or Telegram request_contact. */
export type OutboxButton =
  | string
  | { text: string; request_contact?: boolean };

export type BotQueue = (
  text: string,
  buttons?: OutboxButton[],
  attachmentIds?: string[],
) => Promise<void>;
