// src/auth/supabase-admin.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseAdminService {
  private readonly supabase: SupabaseClient;
  private readonly url: string;
  private readonly serviceKey: string;
  private readonly anonKey: string;

  constructor() {
    this.url = process.env.SUPABASE_URL || '';
    this.serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    this.anonKey = process.env.SUPABASE_ANON_KEY || this.serviceKey;

    if (!this.url || !this.serviceKey) {
      throw new InternalServerErrorException('Supabase env vars are missing');
    }

    this.supabase = createClient(this.url, this.serviceKey);
  }

  /**
   * Try the password grant; success => password is correct.
   * Uses anon key if provided; falls back to service key.
   */
  async verifyPassword(email: string, password: string): Promise<boolean> {
    const res = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.anonKey,
      },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) return true;

    // 400 invalid_grant on bad password
    return false;
  }

  async setPassword(userId: string, newPassword: string): Promise<void> {
    const { error } = await this.supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) throw new InternalServerErrorException(error.message);
  }

  async updateUserMeta(
    userId: string,
    meta: { name?: string | null; phone?: string | null },
  ): Promise<void> {
    const { error } = await this.supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...(meta.name !== undefined && { name: meta.name }), ...(meta.phone !== undefined && { phone: meta.phone }) },
    });
    if (error) throw new InternalServerErrorException(error.message);
  }

  async deleteUserConversations(userId: string): Promise<void> {
    const { error } = await this.supabase.from('conversations').delete().eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const res = await fetch(`${this.url}/auth/v1/admin/users/${userId}/sessions`, {
      method: 'DELETE',
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
      },
    });

    if (!res.ok) {
      let errMsg = 'Failed to revoke user sessions';
      try {
        const json = await res.json();
        if (json?.error_description) errMsg = json.error_description;
        else if (json?.error) errMsg = json.error;
        else if (json?.message) errMsg = json.message;
      } catch {
        // ignore parse errors
      }
      throw new InternalServerErrorException(errMsg);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.supabase.auth.admin.deleteUser(userId, false);
    if (error) throw new InternalServerErrorException(error.message);
  }

}
