import { LimitsInterceptor } from './limits.interceptor';

describe('LimitsInterceptor', () => {
  it('should be defined', () => {
    expect(new LimitsInterceptor(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    )).toBeDefined();
  });
});
