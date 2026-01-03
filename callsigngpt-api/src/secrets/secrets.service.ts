import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class SecretsService {
  private readEnv(key: string): string | undefined {
    const raw = process.env[key];
    if (!raw) return undefined;
    const value = raw.trim();
    return value.length ? value : undefined;
  }

  /**
   * Return a secret from the environment.
   */
  async get(key: string): Promise<string | undefined> {
    return this.readEnv(key);
  }

  /**
   * Same as get() but throws if the secret is missing.
   */
  async require(key: string): Promise<string> {
    const val = this.readEnv(key);
    if (!val) {
      throw new InternalServerErrorException(`${key} not configured in env`);
    }
    return val;
  }
}
