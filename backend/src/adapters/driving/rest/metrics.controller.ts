import { Controller, ForbiddenException, Get, Headers, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MetricsPort } from '../../../domain/ports/metrics.port';
import { METRICS_PORT } from '../../../domain/tokens';

@Controller('metrics')
export class MetricsController {
  constructor(
    @Inject(METRICS_PORT) private readonly metrics: MetricsPort,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  getMetrics(@Headers('x-admin-key') adminKey?: string) {
    const expectedKey = this.configService.get<string>('ADMIN_METRICS_KEY') ?? '';
    if (!expectedKey || adminKey !== expectedKey) {
      throw new ForbiddenException('Forbidden');
    }

    return this.metrics.getSnapshot();
  }
}
