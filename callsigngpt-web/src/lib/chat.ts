export type Role = 'system' | 'user' | 'assistant';

export type AttachmentType = 'image' | 'file';

export type BaseAttachment = {
  type: AttachmentType;
  name: string;
  mime: string;
  size: number;
};

export type ImageAttachment = BaseAttachment & {
  type: 'image';
  src: string;
};

export type FileAttachment = BaseAttachment & {
  type: 'file';
  src?: string;
};

export type Attachment = ImageAttachment | FileAttachment;

export type UIMsg = {
  id: string;
  role: Role;
  content: string;
  attachment?: Attachment;
  /** Unix epoch millis of when the message was created (client-side if server missing it) */
  createdAt?: number;
};

export function coerceTimestamp(raw: UIMsg['createdAt']): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

export function ensureMessageTimestamp(msg: UIMsg, fallback?: number): UIMsg {
  const ts = coerceTimestamp(msg.createdAt);
  if (ts !== undefined) {
    if (ts === msg.createdAt) return msg;
    return { ...msg, createdAt: ts };
  }
  const nextTs = fallback ?? Date.now();
  return { ...msg, createdAt: nextTs };
}

export function withTimestamps(msgs: UIMsg[], startAt?: number): UIMsg[] {
  const base = startAt ?? Date.now() - msgs.length;
  return msgs.map((m, idx) => ensureMessageTimestamp(m, base + idx));
}
