import type {
  AgentRequest,
  AgentResponse,
  ProcessingStep,
} from "../types/agent";

const REQUEST_LIMITS = {
  promptMaxLength: 1000,
  historyMessageMaxLength: 500,
  historyMaxEntries: 20,
} as const;

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

export async function invokeAgentService(
  request: AgentRequest,
  options: RequestOptions = {},
): Promise<AgentResponse> {
  const payload = normalizeRequest(request);

  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": payload.userId,
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

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

  const res = await fetch("/api/agent/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": payload.userId,
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

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
    const { done, value } = await reader.read();
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
}
