import { Controller, Post, Body, Get, UseGuards, Sse } from '@nestjs/common';
import { AgentRequestDto } from './dto/agent-request.dto';
import { SupervisorService } from '../../../application/supervisor/supervisor.service';
import { StreamingSupervisorService } from '../../../application/supervisor/streaming-supervisor.service';
import { PromptSanitizerPipe } from './pipes/prompt-sanitizer.pipe';
import { RateLimitGuard } from './guards/rate-limit.guard';
import type { AgentResponse, StreamEvent } from '../../../domain/types/agent';
import { Observable, map } from 'rxjs';

@Controller('agent')
@UseGuards(RateLimitGuard)
export class AgentController {
  constructor(
    private readonly supervisor: SupervisorService,
    private readonly streamingSupervisor: StreamingSupervisorService,
  ) {}

  @Post('chat')
  async chat(@Body(new PromptSanitizerPipe()) dto: AgentRequestDto): Promise<AgentResponse> {
    return this.supervisor.processRequest(dto);
  }

  @Sse('chat/stream')
  streamChat(@Body(new PromptSanitizerPipe()) dto: AgentRequestDto): Observable<{
    id: string;
    event: string;
    data: string;
  }> {
    return this.streamingSupervisor.processRequestStream(dto).pipe(
      map((event: StreamEvent) => ({
        id: event.id,
        event: event.type,
        data: JSON.stringify(event),
      })),
    );
  }
}

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok' };
  }

  @Get('live')
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  readiness() {
    // Basic readiness — if we got here, the app is initialized and routes are registered
    return { status: 'ok' };
  }
}
