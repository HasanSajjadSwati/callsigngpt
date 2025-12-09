import { SupabaseJwtGuard } from './supabase-jwt.guard';

describe('SupabaseJwtGuard', () => {
  it('should be defined', () => {
    expect(new SupabaseJwtGuard()).toBeDefined();
  });
});
