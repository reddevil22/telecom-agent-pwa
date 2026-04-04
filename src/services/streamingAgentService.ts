import type { AgentRequest, AgentResponse, StreamEvent } from '../types/agent';

/**
 * Parses SSE stream data and yields StreamEvent objects.
 * Handles the SSE format: `data: {...}\n\n`
 */
async function* parseSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<StreamEvent, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE messages are separated by double newlines
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || ''; // Keep incomplete chunk in buffer

    for (const part of parts) {
      const lines = part.split('\n');
      let dataLine = '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          dataLine = line.slice(6); // Remove 'data: ' prefix
        }
      }

      if (dataLine) {
        try {
          const event = JSON.parse(dataLine) as StreamEvent;
          yield event;
        } catch (e) {
          console.error('Failed to parse SSE data:', dataLine, e);
        }
      }
    }
  }

  // Process any remaining data in buffer
  if (buffer.trim()) {
    const lines = buffer.split('\n');
    let dataLine = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        dataLine = line.slice(6);
      }
    }

    if (dataLine) {
      try {
        const event = JSON.parse(dataLine) as StreamEvent;
        yield event;
      } catch (e) {
        console.error('Failed to parse final SSE data:', dataLine, e);
      }
    }
  }
}

/**
 * Streaming result that includes both the async generator and a promise
 * that resolves to the final AgentResponse.
 */
export interface StreamingResult {
  /** Async generator that yields StreamEvents as they arrive */
  events: AsyncGenerator<StreamEvent, void, unknown>;
  /** Promise that resolves to the final AgentResponse when streaming completes */
  response: Promise<AgentResponse>;
  /** Abort the streaming request */
  abort: () => void;
}

/**
 * Streams agent responses via Server-Sent Events (SSE).
 *
 * This function:
 * 1. Opens an SSE connection to /api/agent/chat/stream
 * 2. Yields StreamEvents as they arrive (processing steps, screen data, etc.)
 * 3. Returns the final AgentResponse when complete
 *
 * Example usage:
 * ```typescript
 * const { events, response, abort } = streamAgentResponse(request);
 *
 * for await (const event of events) {
 *   console.log('Step:', event.data.step?.label, event.data.step?.status);
 * }
 *
 * const finalResponse = await response;
 * ```
 */
export function streamAgentResponse(request: AgentRequest): StreamingResult {
  const abortController = new AbortController();

  const responsePromise = new Promise<AgentResponse>(async (resolve, reject) => {
    try {
      const res = await fetch('/api/agent/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      if (!res.ok) {
        throw new Error(`Stream error: ${res.status} ${res.statusText}`);
      }

      if (!res.body) {
        throw new Error('Response body is null');
      }

      const reader = res.body.getReader();
      const collectedEvents: StreamEvent[] = [];
      let finalResponse: AgentResponse | null = null;

      for await (const event of parseSSEStream(reader)) {
        collectedEvents.push(event);

        // Check if this is the completion event with response data
        if (event.type === 'screen_ready' && event.data.screenType && event.data.screenData) {
          // Build a partial response from screen_ready event
          // We'll complete it when we get the 'complete' event
        }

        if (event.type === 'complete') {
          // Find the screen_ready event to construct the final response
          const screenReadyEvent = collectedEvents.find(e => e.type === 'screen_ready');
          if (screenReadyEvent?.data.screenType && screenReadyEvent.data.screenData) {
            finalResponse = {
              screenType: screenReadyEvent.data.screenType,
              screenData: screenReadyEvent.data.screenData,
              replyText: 'Response received via streaming',
              suggestions: [],
              confidence: 0.95,
              processingSteps: collectedEvents
                .filter(e => e.type === 'step_start' || e.type === 'step_complete')
                .map(e => e.data.step)
                .filter((s): s is { label: string; status: 'pending' | 'active' | 'done' } => !!s),
            };
          }
        }
      }

      if (finalResponse) {
        resolve(finalResponse);
      } else {
        reject(new Error('Stream completed without a valid response'));
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        reject(new Error('Request was aborted'));
      } else {
        reject(error);
      }
    }
  });

  // Create an async generator that yields events
  async function* eventGenerator(): AsyncGenerator<StreamEvent, void, unknown> {
    const res = await fetch('/api/agent/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(request),
      signal: abortController.signal,
    });

    if (!res.ok) {
      throw new Error(`Stream error: ${res.status} ${res.statusText}`);
    }

    if (!res.body) {
      throw new Error('Response body is null');
    }

    const reader = res.body.getReader();

    for await (const event of parseSSEStream(reader)) {
      yield event;
    }
  }

  return {
    events: eventGenerator(),
    response: responsePromise,
    abort: () => abortController.abort(),
  };
}

/**
 * Check if the browser supports Server-Sent Events.
 */
export function isStreamingSupported(): boolean {
  return typeof EventSource !== 'undefined' || typeof ReadableStream !== 'undefined';
}
