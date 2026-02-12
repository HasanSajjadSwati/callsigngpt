import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AppConfigService } from '../config/app-config.service';
import type { JwtPayload } from './jwt-payload';

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseJwtGuard.name);
  private secretKey: Uint8Array | undefined;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
  ) {}

  /** Lazily create the HMAC key so the guard is injectable even before config is fully loaded. */
  private getSecretKey(): Uint8Array {
    if (!this.secretKey) {
      const secret = this.config.supabaseJwtSecret;
      this.secretKey = new TextEncoder().encode(secret);
    }
    return this.secretKey;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1) Allow @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    if (!token) throw new UnauthorizedException('Missing bearer token');

    // Verify JWT locally using the Supabase JWT secret (HS256)
    let payload: JwtPayload;
    try {
      const { payload: verified } = await jwtVerify(token, this.getSecretKey(), {
        algorithms: ['HS256'],
      });
      payload = verified as unknown as JwtPayload;
    } catch (err: any) {
      this.logger.debug(`JWT verification failed: ${err?.code || err?.message}`);
      throw new UnauthorizedException('Invalid token');
    }

    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid user payload');
    }

    // Attach to request for controllers
    req.user = { id: payload.sub, email: payload.email ?? '' };

    return true;
  }
}
