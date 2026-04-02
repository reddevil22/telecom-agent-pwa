import type { AgentRequest, AgentResponse } from '../types/agent';

export async function invokeAgentService(request: AgentRequest): Promise<AgentResponse> {
  const res = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw new Error(`Agent service error: ${res.status}`);
  }

  return res.json();
}
