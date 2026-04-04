import { Observable } from 'rxjs';
import type { AgentRequest, AgentResponse, StreamEvent, StreamEventType } from '../../domain/types/agent';
import type { SupervisorService } from './supervisor.service';
import type { PinoLogger } from 'nestjs-pino';

/**
 * StreamingSupervisorService wraps the SupervisorService and exposes
 * an RxJS Observable that emits real-time stream events during agent processing.
 *
 * This enables Server-Sent Events (SSE) for the frontend, providing:
 * - Real-time processing step updates
 * - Tool call/result notifications
 * - Progressive screen data delivery
 */
export class StreamingSupervisorService {
  constructor(
    private readonly supervisor: SupervisorService,
    private readonly logger?: PinoLogger,
  ) {
    this.logger?.setContext(StreamingSupervisorService.name);
  }

  /**
   * Process a request with streaming events.
   * Returns an Observable that emits StreamEvents throughout the processing lifecycle.
   */
  processRequestStream(request: AgentRequest): Observable<StreamEvent> {
    return new Observable<StreamEvent>(observer => {
      const correlationId = request.sessionId;
      const startTime = Date.now();

      const emit = (type: StreamEventType, data: StreamEvent['data']): void => {
        const event: StreamEvent = {
          id: crypto.randomUUID(),
          type,
          timestamp: Date.now(),
          correlationId,
          data,
        };
        observer.next(event);
      };

      const process = async (): Promise<void> => {
        try {
          // Emit initial step
          emit('step_start', {
            step: { label: 'Understanding your request', status: 'active' },
            stepIndex: 0,
          });

          // Small delay to allow UI to show the first step
          await this.delay(50);

          emit('step_complete', {
            step: { label: 'Understanding your request', status: 'done' },
            stepIndex: 0,
          });

          // Emit processing step
          emit('step_start', {
            step: { label: 'Processing', status: 'active' },
            stepIndex: 1,
          });

          // Call the existing supervisor (non-streaming for now)
          // In a full implementation, we would modify SupervisorService to emit events
          const response = await this.supervisor.processRequest(request);

          emit('step_complete', {
            step: { label: 'Processing', status: 'done' },
            stepIndex: 1,
          });

          // Emit preparing response step
          emit('step_start', {
            step: { label: 'Preparing response', status: 'active' },
            stepIndex: 2,
          });

          // Emit screen ready event with the response data
          emit('screen_ready', {
            screenType: response.screenType,
            screenData: response.screenData,
          });

          emit('step_complete', {
            step: { label: 'Preparing response', status: 'done' },
            stepIndex: 2,
          });

          // Emit completion
          emit('complete', {});

          this.logger?.info({
            correlationId,
            duration: Date.now() - startTime,
            screenType: response.screenType,
          }, 'Streaming request completed');

          observer.complete();
        } catch (error) {
          this.logger?.error({
            correlationId,
            err: error instanceof Error ? { message: error.message, stack: error.stack } : error,
          }, 'Streaming request failed');

          emit('error', {
            error: error instanceof Error ? error.message : 'Unknown error occurred',
          });

          observer.error(error);
        }
      };

      process();
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
