import type { CircuitBreakerPort, CircuitState } from '../ports/circuit-breaker.port';

const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 30_000;

export class CircuitBreakerService implements CircuitBreakerPort {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  getState(): CircuitState {
    this.checkHalfOpenTransition();
    return this.state;
  }

  isAvailable(): boolean {
    this.checkHalfOpenTransition();
    return this.state !== 'open';
  }

  recordSuccess(): void {
    this.checkHalfOpenTransition();
    if (this.state === 'half_open') {
      this.state = 'closed';
    }
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  recordFailure(): void {
    this.checkHalfOpenTransition();
    this.consecutiveFailures++;

    if (this.state === 'half_open') {
      this.tripOpen();
      return;
    }

    if (this.state === 'closed' && this.consecutiveFailures >= FAILURE_THRESHOLD) {
      this.tripOpen();
    }
  }

  private tripOpen(): void {
    this.state = 'open';
    this.openedAt = this.now();
  }

  private checkHalfOpenTransition(): void {
    if (this.state === 'open' && this.openedAt !== null) {
      if (this.now() - this.openedAt >= OPEN_DURATION_MS) {
        this.state = 'half_open';
      }
    }
  }
}
