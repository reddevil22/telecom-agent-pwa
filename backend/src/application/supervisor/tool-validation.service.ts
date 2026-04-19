import {
  ALLOWED_TOOLS,
  TOOL_ARG_CONSTRAINTS,
  TOOL_ARG_SCHEMAS,
} from "../../domain/constants/security-constants";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface LoopToolMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

const INVALID_TOOL_ERROR =
  "Invalid tool call. Use only the allowed tools with correct arguments.";

export class ToolValidationService {
  validate(toolCall: {
    function: { name: string; arguments: string };
  }): string | null {
    if (!ALLOWED_TOOLS.has(toolCall.function.name)) {
      return INVALID_TOOL_ERROR;
    }

    const expectedKeys = TOOL_ARG_SCHEMAS[toolCall.function.name];
    if (!expectedKeys) {
      return INVALID_TOOL_ERROR;
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      return INVALID_TOOL_ERROR;
    }

    const argKeys = Object.keys(args);

    for (const key of argKeys) {
      if (!expectedKeys.includes(key)) {
        return INVALID_TOOL_ERROR;
      }
    }

    for (const key of expectedKeys) {
      if (typeof args[key] !== "string") {
        return INVALID_TOOL_ERROR;
      }
    }

    const constraints = TOOL_ARG_CONSTRAINTS[toolCall.function.name];
    if (constraints) {
      for (const [key, constraint] of Object.entries(constraints)) {
        const value = args[key];
        if (typeof value !== "string") {
          continue;
        }

        if (value.length > constraint.maxLength) {
          return INVALID_TOOL_ERROR;
        }

        if (constraint.pattern && !constraint.pattern.test(value)) {
          return INVALID_TOOL_ERROR;
        }
      }
    }

    return null;
  }

  pushErrorToMessages(
    messages: LoopToolMessage[],
    toolCall: ToolCall,
    error: string,
  ): void {
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: [toolCall],
    });

    messages.push({
      role: "tool",
      content: JSON.stringify({ error }),
      tool_call_id: toolCall.id,
    });
  }
}
