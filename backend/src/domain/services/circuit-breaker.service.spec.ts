import { CircuitBreakerService } from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  let cb: CircuitBreakerService;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000_000;
    cb = new CircuitBreakerService(() => currentTime);
  });

  // ── Closed state (normal) ──────────────────────────────────

  describe('closed state', () => {
    it('starts in closed state', () => {
      expect(cb.getState()).toBe('closed');
    });

    it('allows requests when closed', () => {
      expect(cb.isAvailable()).toBe(true);
    });

    it('stays closed after success', () => {
      cb.recordSuccess();
      expect(cb.getState()).toBe('closed');
    });

    it('stays closed after fewer than 3 failures', () => {
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('closed');
      expect(cb.isAvailable()).toBe(true);
    });
  });

  // ── Opening (closed → open) ────────────────────────────────

  describe('opening', () => {
    it('opens after 3 consecutive failures', () => {
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('open');
      expect(cb.isAvailable()).toBe(false);
    });

    it('does not open if successes are interleaved', () => {
      cb.recordFailure();
      cb.recordSuccess();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('closed');
    });
  });

  // ── Open state (short-circuit) ─────────────────────────────

  describe('open state', () => {
    beforeEach(() => {
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
    });

    it('blocks requests when open', () => {
      expect(cb.isAvailable()).toBe(false);
    });

    it('stays open before timeout', () => {
      currentTime += 29_999;
      expect(cb.getState()).toBe('open');
    });

    it('transitions to half-open after 30 seconds', () => {
      currentTime += 30_000;
      expect(cb.getState()).toBe('half_open');
      expect(cb.isAvailable()).toBe(true);
    });
  });

  // ── Half-open state (probe) ────────────────────────────────

  describe('half-open state', () => {
    beforeEach(() => {
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      currentTime += 30_000;
    });

    it('allows one request when half-open', () => {
      expect(cb.isAvailable()).toBe(true);
    });

    it('closes on success', () => {
      cb.recordSuccess();
      expect(cb.getState()).toBe('closed');
    });

    it('reopens on failure', () => {
      cb.recordFailure();
      expect(cb.getState()).toBe('open');
      expect(cb.isAvailable()).toBe(false);
    });

    it('resets failure count on close', () => {
      cb.recordSuccess(); // closes
      expect(cb.getState()).toBe('closed');

      // Need 3 new failures to open again
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('closed'); // not yet open
      cb.recordFailure();
      expect(cb.getState()).toBe('open');
    });
  });

  // ── Full cycle ─────────────────────────────────────────────

  describe('full recovery cycle', () => {
    it('closed → open → half_open → closed', () => {
      expect(cb.getState()).toBe('closed');

      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('open');

      currentTime += 30_000;
      expect(cb.getState()).toBe('half_open');

      cb.recordSuccess();
      expect(cb.getState()).toBe('closed');
      expect(cb.isAvailable()).toBe(true);
    });

    it('closed → open → half_open → open (failed probe)', () => {
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('open');

      currentTime += 30_000;
      expect(cb.getState()).toBe('half_open');

      cb.recordFailure();
      expect(cb.getState()).toBe('open');

      // Need another 30s wait before next probe
      currentTime += 29_999;
      expect(cb.getState()).toBe('open');
      currentTime += 1;
      expect(cb.getState()).toBe('half_open');
    });
  });
});
