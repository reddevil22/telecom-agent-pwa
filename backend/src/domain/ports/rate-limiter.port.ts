export interface RateLimiterPort {
  isAllowed(key: string, now: number): boolean | Promise<boolean>;
  reset?(): void;
}
