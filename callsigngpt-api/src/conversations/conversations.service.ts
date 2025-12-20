import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

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

export type Msg = {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  attachment?: Attachment;
};
export type Conversation = { id: string; userId: string; title: string; messages: Msg[]; updatedAt: number };

const DEFAULT_TITLE = 'New chat';
const MAX_TITLE_LENGTH = 80;

function deriveTitle(messages: Msg[] = [], providedTitle?: string, fallback = DEFAULT_TITLE) {
  const cleanProvided = (providedTitle ?? '').trim();
  if (cleanProvided && cleanProvided.toLowerCase() !== DEFAULT_TITLE.toLowerCase()) {
    return cleanProvided.slice(0, MAX_TITLE_LENGTH);
  }
  const firstUser = messages.find((m) => m.role === 'user' && Boolean(m.content?.trim()));
  if (firstUser?.content) {
    return firstUser.content.trim().slice(0, MAX_TITLE_LENGTH);
  }
  if (cleanProvided) return cleanProvided.slice(0, MAX_TITLE_LENGTH);
  return fallback.slice(0, MAX_TITLE_LENGTH);
}

@Injectable()
export class ConversationsService {
  // userId -> (id -> conversation)
  private store = new Map<string, Map<string, Conversation>>();

  private userMap(userId: string) {
    let m = this.store.get(userId);
    if (!m) { m = new Map(); this.store.set(userId, m); }
    return m;
  }

  list(userId: string): Pick<Conversation, 'id'|'title'|'updatedAt'>[] {
    return Array.from(this.userMap(userId).values())
      .sort((a,b) => b.updatedAt - a.updatedAt)
      .map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }));
  }

  get(userId: string, id: string): Conversation {
    const c = this.userMap(userId).get(id);
    if (!c) throw new NotFoundException('Conversation not found');
    return c;
  }

  create(userId: string, title = DEFAULT_TITLE, messages: Msg[] = []): Conversation {
    const id = randomUUID();
    const now = Date.now();
    const finalTitle = deriveTitle(messages, title);
    const c: Conversation = { id, userId, title: finalTitle, messages, updatedAt: now };
    this.userMap(userId).set(id, c);
    return c;
  }

  update(userId: string, id: string, patch: Partial<Pick<Conversation,'title'|'messages'>>): Conversation {
    const map = this.userMap(userId);
    const c = map.get(id);
    if (!c) throw new NotFoundException('Conversation not found');

    const nextMessages = patch.messages ?? c.messages;
    if (patch.title !== undefined) {
      c.title = deriveTitle(nextMessages, patch.title, c.title || DEFAULT_TITLE);
    } else if (!c.title || c.title.toLowerCase() === DEFAULT_TITLE.toLowerCase()) {
      c.title = deriveTitle(nextMessages, undefined, c.title || DEFAULT_TITLE);
    }
    if (patch.messages !== undefined) c.messages = patch.messages;
    c.updatedAt = Date.now();

    map.set(id, c);
    return c;
  }

  delete(userId: string, id: string) {
    const map = this.userMap(userId);
    const existed = map.delete(id);
    if (!existed) throw new NotFoundException('Conversation not found');
    return { ok: true };
  }
}
