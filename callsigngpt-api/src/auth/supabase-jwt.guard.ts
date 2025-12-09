import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  private url = process.env.SUPABASE_URL!;
  private apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  constructor(private readonly reflector: Reflector) {
    if (!this.url || !this.apiKey) {
      // Do not crash the app; throw at runtime when the guard is used
      // so health and other Public routes still work if misconfigured.
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1) Allow @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();

    if (!this.url || !this.apiKey) {
      throw new UnauthorizedException('Auth not configured');
    }

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    if (!token) throw new UnauthorizedException('Missing bearer token');

    // Verify token with Supabase Auth REST
    const res = await fetch(`${this.url}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: this.apiKey,
      },
    });

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
