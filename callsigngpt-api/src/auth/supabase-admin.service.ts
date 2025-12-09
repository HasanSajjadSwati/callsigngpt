// src/auth/supabase-admin.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfigService } from '../config/app-config.service';
import { fetchWithTimeout } from '../common/http/fetch-with-timeout';

@Injectable()
export class SupabaseAdminService {
  private readonly supabase: SupabaseClient;
  private readonly url: string;
  private readonly serviceKey: string;
  private readonly anonKey: string;

  constructor(private readonly config: AppConfigService) {
    this.url = this.config.supabaseUrl;
    this.serviceKey = this.config.supabaseServiceRoleKey;
    this.anonKey = this.config.supabaseAnonKey;

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
    try {
      const res = await fetchWithTimeout(
        `${this.url}/auth/v1/token?grant_type=password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.anonKey,
          },
          body: JSON.stringify({ email, password }),
        },
        this.config.requestTimeoutMs,
      );

      if (res.ok) return true;
      if (res.status === 400 || res.status === 401) return false; // invalid_grant

      const txt = await res.text().catch(() => '');
      throw new InternalServerErrorException(
        `Supabase password verification failed (${res.status}): ${txt || res.statusText}`,
      );
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new InternalServerErrorException('Supabase password verification timed out');
      }
      throw error;
    }
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
    const res = await fetchWithTimeout(
      `${this.url}/auth/v1/admin/users/${userId}/sessions`,
      {
        method: 'DELETE',
        headers: {
          apikey: this.serviceKey,
          Authorization: `Bearer ${this.serviceKey}`,
        },
      },
      this.config.requestTimeoutMs,
    );

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
