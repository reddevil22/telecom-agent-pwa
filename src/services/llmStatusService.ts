import { fetchWithTimeout } from "./fetchUtils";

export interface LlmStatus {
  llm: 'available' | 'unavailable';
  mode: 'normal' | 'degraded';
  circuitState: string;
}

export type StatusListener = (status: LlmStatus) => void;

const POLL_INTERVAL_MS = 15_000;
const STATUS_TIMEOUT_MS = 5_000;

class LlmStatusServiceImpl {
  private status: LlmStatus = { llm: 'available', mode: 'normal', circuitState: 'closed' };
  private listeners = new Set<StatusListener>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  getStatus(): LlmStatus {
    return this.status;
  }

  isDegraded(): boolean {
    return this.status.mode === 'degraded';
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => { this.listeners.delete(listener); };
  }

  startPolling(): void {
    if (this.intervalId) return;
    this.poll();
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const res = await fetchWithTimeout(
        "/api/agent/status",
        {},
        STATUS_TIMEOUT_MS,
      );
      if (!res.ok) return;
      const next = await res.json() as LlmStatus;
      const changed = next.mode !== this.status.mode;
      this.status = next;
      if (changed) {
        for (const listener of this.listeners) {
          listener(this.status);
        }
      }
    } catch {
      // Network error — assume available (don't trigger degraded on network blip)
    }
  }
}

export const llmStatusService = new LlmStatusServiceImpl();
