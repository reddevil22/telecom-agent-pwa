import { Controller, Post, Body, Get } from '@nestjs/common';
import { AgentRequestDto } from './dto/agent-request.dto';
import { SupervisorService } from '../../../application/supervisor/supervisor.service';
import type { AgentResponse } from '../../../domain/types/agent';

@Controller('agent')
export class AgentController {
  constructor(private readonly supervisor: SupervisorService) {}

  @Post('chat')
  async chat(@Body() dto: AgentRequestDto): Promise<AgentResponse> {
    return this.supervisor.processRequest(dto);
  }
}

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
