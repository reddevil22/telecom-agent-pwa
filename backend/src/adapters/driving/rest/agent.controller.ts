import { Controller, Post, Body, Get, Header, UseGuards } from '@nestjs/common';
import { AgentRequestDto } from './dto/agent-request.dto';
import { SupervisorService } from '../../../application/supervisor/supervisor.service';
import { PromptSanitizerPipe } from './pipes/prompt-sanitizer.pipe';
import { RateLimitGuard } from './guards/rate-limit.guard';
import type { AgentResponse } from '../../../domain/types/agent';
import { QUICK_ACTIONS } from './quick-actions.config';

@Controller('agent')
@UseGuards(RateLimitGuard)
export class AgentController {
  constructor(
    private readonly supervisor: SupervisorService,
  ) {}

  @Post('chat')
  async chat(@Body(new PromptSanitizerPipe()) dto: AgentRequestDto): Promise<AgentResponse> {
    return this.supervisor.processRequest(dto);
  }

  @Get('status')
  @Header('Cache-Control', 'no-store')
  getStatus() {
    const { available, state } = this.supervisor.getLlmStatus();
    return {
      llm: available ? 'available' : 'unavailable',
      mode: available ? 'normal' : 'degraded',
      circuitState: state,
    };
  }

  @Get('quick-actions')
  @Header('Cache-Control', 'public, max-age=300')
  getQuickActions() {
    return { actions: QUICK_ACTIONS };
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
