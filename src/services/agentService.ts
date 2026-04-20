import type {
  AgentRequest,
  AgentResponse,
  ProcessingStep,
} from "../types/agent";
import { fetchWithTimeout } from "./fetchUtils";

const REQUEST_LIMITS = {
  promptMaxLength: 1000,
  historyMessageMaxLength: 500,
  historyMaxEntries: 20,
} as const;

const AGENT_REQUEST_TIMEOUT_MS = 30_000;
const AGENT_STREAM_IDLE_TIMEOUT_MS = 60_000;
const STREAM_INITIAL_TIMEOUT_REASON =
  `stream-initial-timeout:${AGENT_REQUEST_TIMEOUT_MS}`;
const STREAM_IDLE_TIMEOUT_REASON =
  `stream-idle-timeout:${AGENT_STREAM_IDLE_TIMEOUT_MS}`;

function clampText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function normalizeRequest(request: AgentRequest): AgentRequest {
  const conversationHistory = request.conversationHistory
    .slice(-REQUEST_LIMITS.historyMaxEntries)
    .map((message) => ({
      ...message,
      text: clampText(message.text, REQUEST_LIMITS.historyMessageMaxLength),
    }));

  return {
    ...request,
    prompt: clampText(request.prompt, REQUEST_LIMITS.promptMaxLength),
    conversationHistory,
  };
}

interface RequestOptions {
  signal?: AbortSignal;
}

function bindExternalAbort(
  controller: AbortController,
  signal?: AbortSignal,
): () => void {
  if (!signal) {
    return () => undefined;
  }

  const onAbort = () => {
    controller.abort(signal.reason);
  };

  if (signal.aborted) {
    controller.abort(signal.reason);
  } else {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  return () => {
    signal.removeEventListener("abort", onAbort);
  };
}

export async function invokeAgentService(
  request: AgentRequest,
  options: RequestOptions = {},
): Promise<AgentResponse> {
  const payload = normalizeRequest(request);

  const res = await fetchWithTimeout(
    "/api/agent/chat",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": payload.userId,
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    },
    AGENT_REQUEST_TIMEOUT_MS,
  );

  if (!res.ok) {
    throw new Error(`Agent service error: ${res.status}`);
  }

  return res.json();
}

export type StepCallback = (steps: ProcessingStep[]) => void;

export async function invokeAgentStream(
  request: AgentRequest,
  onStep: StepCallback,
  options: RequestOptions = {},
): Promise<AgentResponse> {
  const payload = normalizeRequest(request);

  const controller = new AbortController();
  const unbindExternalAbort = bindExternalAbort(controller, options.signal);

  try {
    const initialTimeoutId = globalThis.setTimeout(() => {
      controller.abort(STREAM_INITIAL_TIMEOUT_REASON);
    }, AGENT_REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch("/api/agent/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": payload.userId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.reason === STREAM_INITIAL_TIMEOUT_REASON) {
        throw new Error(
          `Agent stream request timed out after ${AGENT_REQUEST_TIMEOUT_MS}ms`,
        );
      }
      throw error;
    } finally {
      globalThis.clearTimeout(initialTimeoutId);
    }

    if (!res.ok) {
      throw new Error(`Agent service error: ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No readable stream");

    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: AgentResponse | null = null;
    const steps: ProcessingStep[] = [];

    while (true) {
      const idleTimeoutId = globalThis.setTimeout(() => {
        controller.abort(STREAM_IDLE_TIMEOUT_REASON);
      }, AGENT_STREAM_IDLE_TIMEOUT_MS);

      let done = false;
      let value: Uint8Array | undefined;

      try {
        ({ done, value } = await reader.read());
      } catch (error) {
        if (controller.signal.reason === STREAM_IDLE_TIMEOUT_REASON) {
          throw new Error(
            `Agent stream stalled for more than ${AGENT_STREAM_IDLE_TIMEOUT_MS}ms`,
          );
        }
        throw error;
      } finally {
        globalThis.clearTimeout(idleTimeoutId);
      }

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let eventType = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);

            if (eventType === "step") {
              // Update existing step or add new one
              const existing = steps.findIndex((s) => s.label === parsed.label);
              if (existing >= 0) {
                steps[existing] = { label: parsed.label, status: parsed.status };
              } else {
                steps.push({ label: parsed.label, status: parsed.status });
              }
              onStep([...steps]);
            } else if (eventType === "result") {
              finalResult = parsed as AgentResponse;
            } else if (eventType === "error") {
              throw new Error(parsed.message ?? "Streaming error");
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              // JSON parse failed — likely incomplete SSE data
              console.warn("Failed to parse SSE data, skipping:", data);
            } else {
              throw e;
            }
          }
          eventType = "";
        }
      }
    }

    if (!finalResult) {
      throw new Error("Stream ended without result");
    }

    return finalResult;
  } finally {
    unbindExternalAbort();
  }
}
