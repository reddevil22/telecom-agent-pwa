import type {
  AgentRequest,
  AgentResponse,
  ProcessingStep,
} from "../types/agent";

export async function invokeAgentService(
  request: AgentRequest,
): Promise<AgentResponse> {
  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": request.userId,
    },
    body: JSON.stringify(request),
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
): Promise<AgentResponse> {
  const res = await fetch("/api/agent/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": request.userId,
    },
    body: JSON.stringify(request),
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
