import type { LlmToolDefinition } from '../../domain/ports/llm.port';
import { generateToolDefinitions as generateFromRegistry } from '../../domain/constants/tool-registry';

// Generate tool definitions from centralized registry
export const TOOL_DEFINITIONS: LlmToolDefinition[] = generateFromRegistry();
