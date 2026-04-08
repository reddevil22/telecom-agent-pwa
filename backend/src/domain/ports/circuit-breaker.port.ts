export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerPort {
  getState(): CircuitState;
  isAvailable(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
}
