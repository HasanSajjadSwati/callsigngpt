import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AppConfigService } from '../config/app-config.service';
import { fetchWithTimeout } from '../common/http/fetch-with-timeout';

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1) Allow @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();

    const url = this.config.supabaseUrl;
    const apiKey = this.config.supabaseAnonKey;

    if (!url || !apiKey) {
      throw new UnauthorizedException('Auth not configured');
    }

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    if (!token) throw new UnauthorizedException('Missing bearer token');

    // Verify token with Supabase Auth REST
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${url}/auth/v1/user`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: apiKey,
          },
        },
        this.config.requestTimeoutMs,
      );
    } catch (error: any) {
      const reason = error?.name === 'AbortError' ? 'timed out' : 'failed';
      throw new UnauthorizedException(`Token validation ${reason}`);
    }

    if (!res.ok) {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await res.json(); // { id, email, ... }
    if (!user?.id || !user?.email) {
      throw new UnauthorizedException('Invalid user payload');
    }

    // Attach to request for controllers
    req.user = { id: user.id, email: user.email };

    return true;
  }
}
