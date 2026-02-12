import { Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { SUPABASE_ADMIN_CLIENT } from '../common/supabase/supabase-admin.token';

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
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async list(userId: string): Promise<Pick<Conversation, 'id' | 'title' | 'updatedAt'>[]> {
    const { data, error } = await this.supabase
      .from('conversations')
      .select('id, title, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []).map((row: any) => ({
      id: row.id,
      title: row.title ?? DEFAULT_TITLE,
      updatedAt: new Date(row.updated_at).getTime(),
    }));
  }

  async get(userId: string, id: string): Promise<Conversation> {
    const { data, error } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (error || !data) throw new NotFoundException('Conversation not found');
    return {
      id: data.id,
      userId: data.user_id,
      title: data.title ?? DEFAULT_TITLE,
      messages: data.messages ?? [],
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  async create(userId: string, title = DEFAULT_TITLE, messages: Msg[] = []): Promise<Conversation> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const finalTitle = deriveTitle(messages, title);
    const { data, error } = await this.supabase
      .from('conversations')
      .insert({
        id,
        user_id: userId,
        title: finalTitle,
        messages,
        updated_at: now,
      })
      .select('*')
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      messages: data.messages ?? [],
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  async update(userId: string, id: string, patch: Partial<Pick<Conversation, 'title' | 'messages'>>): Promise<Conversation> {
    // Fetch existing to apply title derivation logic
    const existing = await this.get(userId, id);

    const nextMessages = patch.messages ?? existing.messages;
    let nextTitle = existing.title;
    if (patch.title !== undefined) {
      nextTitle = deriveTitle(nextMessages, patch.title, existing.title || DEFAULT_TITLE);
    } else if (!existing.title || existing.title.toLowerCase() === DEFAULT_TITLE.toLowerCase()) {
      nextTitle = deriveTitle(nextMessages, undefined, existing.title || DEFAULT_TITLE);
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString(), title: nextTitle };
    if (patch.messages !== undefined) updates.messages = patch.messages;

    const { data, error } = await this.supabase
      .from('conversations')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      messages: data.messages ?? [],
      updatedAt: new Date(data.updated_at).getTime(),
    };
  }

  async delete(userId: string, id: string) {
    const { error, count } = await this.supabase
      .from('conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
    if (count === 0) throw new NotFoundException('Conversation not found');
    return { ok: true };
  }
}
