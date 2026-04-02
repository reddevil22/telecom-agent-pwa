export interface LlmToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmChatResponse {
  message: {
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  };
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface LlmPort {
  chatCompletion(params: {
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    tools?: LlmToolDefinition[];
    tool_choice?: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<LlmChatResponse>;
}
