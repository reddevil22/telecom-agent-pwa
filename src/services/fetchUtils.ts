const TIMEOUT_PREFIX = "timeout:";

function timeoutReason(timeoutMs: number): string {
  return `${TIMEOUT_PREFIX}${timeoutMs}`;
}

function isTimeoutAbort(
  signal: AbortSignal,
  timeoutMs: number,
  error: unknown,
): boolean {
  if (!signal.aborted) return false;
  if (signal.reason !== timeoutReason(timeoutMs)) return false;

  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  return error instanceof Error && error.name === "AbortError";
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const signal = init.signal;

  const forwardAbort = () => {
    controller.abort(signal?.reason);
  };

  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  const timeoutId = globalThis.setTimeout(() => {
    controller.abort(timeoutReason(timeoutMs));
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (isTimeoutAbort(controller.signal, timeoutMs, error)) {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}
