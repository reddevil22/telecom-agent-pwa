import { RateLimitGuard } from './rate-limit.guard';
import { SECURITY_LIMITS } from '../../../../domain/constants/security-constants';
import { ExecutionContext, HttpException } from '@nestjs/common';

function makeContext(sessionId?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        body: sessionId ? { sessionId } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;

  beforeEach(() => {
    guard = new RateLimitGuard();
    // Prevent cleanup timer from keeping process alive
    // @ts-expect-error accessing private for cleanup
    if (guard.cleanupTimer) clearInterval(guard.cleanupTimer);
  });

  it('allows request when no sessionId is provided', () => {
    const ctx = makeContext();
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows first request for a session', () => {
    const ctx = makeContext('session-1');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows requests up to the limit', () => {
    const ctx = makeContext('session-1');
    for (let i = 0; i < SECURITY_LIMITS.RATE_LIMIT_MAX_REQUESTS; i++) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('blocks requests exceeding the limit', () => {
    const ctx = makeContext('session-1');
    for (let i = 0; i < SECURITY_LIMITS.RATE_LIMIT_MAX_REQUESTS; i++) {
      guard.canActivate(ctx);
    }
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it('tracks different sessions independently', () => {
    const ctx1 = makeContext('session-1');
    const ctx2 = makeContext('session-2');

    for (let i = 0; i < SECURITY_LIMITS.RATE_LIMIT_MAX_REQUESTS; i++) {
      guard.canActivate(ctx1);
    }

    // session-2 should still be allowed
    expect(guard.canActivate(ctx2)).toBe(true);
  });

  it('prunes old timestamps outside the window', () => {
    const ctx = makeContext('session-1');

    // Fill up to limit
    for (let i = 0; i < SECURITY_LIMITS.RATE_LIMIT_MAX_REQUESTS; i++) {
      guard.canActivate(ctx);
    }

    // Should be blocked now
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);

    // Manually expire timestamps by accessing internal state
    // @ts-expect-error accessing private for test
    const record = guard.requests.get('session-1')!;
    record.timestamps = record.timestamps.map(() => Date.now() - SECURITY_LIMITS.RATE_LIMIT_WINDOW_MS - 1000);

    // Should be allowed again after timestamps expired
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('cleanup removes stale entries', () => {
    const ctx = makeContext('old-session');
    guard.canActivate(ctx);

    // Expire the timestamp
    // @ts-expect-error accessing private for test
    const record = guard.requests.get('old-session')!;
    record.timestamps = [Date.now() - SECURITY_LIMITS.RATE_LIMIT_WINDOW_MS - 1000];

    // @ts-expect-error accessing private for test
    guard.cleanup();

    // @ts-expect-error accessing private for test
    expect(guard.requests.has('old-session')).toBe(false);
  });
});
