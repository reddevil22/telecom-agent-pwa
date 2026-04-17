import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AgentController, HealthController } from './adapters/driving/rest/agent.controller';
import { MetricsController } from './adapters/driving/rest/metrics.controller';
import { SupervisorService } from './application/supervisor/supervisor.service';
import { LlmModule } from './adapters/driven/llm/llm.module';
import { BalanceBffModule } from './adapters/driven/bff/balance/balance-bff.module';
import { BundlesBffModule } from './adapters/driven/bff/bundles/bundles-bff.module';
import { UsageBffModule } from './adapters/driven/bff/usage/usage-bff.module';
import { SupportBffModule } from './adapters/driven/bff/support/support-bff.module';
import { SqliteDataModule } from './infrastructure/data/sqlite-data.module';
import { LLM_PORT, BALANCE_BFF_PORT, BUNDLES_BFF_PORT, USAGE_BFF_PORT, SUPPORT_BFF_PORT, CONVERSATION_STORAGE_PORT, SCREEN_CACHE_PORT, INTENT_CACHE_PORT, METRICS_PORT, RATE_LIMITER_PORT } from './domain/tokens';
import type { LlmPort } from './domain/ports/llm.port';
import type { BalanceBffPort, BundlesBffPort, UsageBffPort, SupportBffPort } from './domain/ports/bff-ports';
import type { ConversationStoragePort } from './domain/ports/conversation-storage.port';
import type { ScreenCachePort } from './domain/ports/screen-cache.port';
import type { IntentCachePort } from './domain/ports/intent-cache.port';
import type { MetricsPort } from './domain/ports/metrics.port';
import type { RateLimiterPort } from './domain/ports/rate-limiter.port';
import { ScreenCacheModule } from './infrastructure/cache/screen-cache.module';
import { MockTelcoModule } from './infrastructure/telco/mock-telco.module';
import { MockTelcoService } from './infrastructure/telco/mock-telco.service';
import { IntentRouterService } from './domain/services/intent-router.service';
import { IntentCacheService } from './application/supervisor/intent-cache.service';
import { CircuitBreakerService } from './domain/services/circuit-breaker.service';
import { loadIntentRoutingConfig } from './config/intent-routing.config';
import { registerBillingAgents } from './application/sub-agents/billing-agents.provider';
import { registerBundleAgents } from './application/sub-agents/bundle-agents.provider';
import { registerSupportAgents } from './application/sub-agents/support-agents.provider';
import { registerAccountAgents } from './application/sub-agents/account-agents.provider';
import { SimpleMetricsAdapter } from './infrastructure/metrics/simple-metrics.adapter';
import { InMemoryRateLimiterAdapter } from './infrastructure/rate-limiter/in-memory-rate-limiter.adapter';

type IntentRoutingConfig = ReturnType<typeof loadIntentRoutingConfig>;
const INTENT_ROUTING_CONFIG = Symbol('INTENT_ROUTING_CONFIG');

@Module({
  imports: [LlmModule, BalanceBffModule, BundlesBffModule, UsageBffModule, SupportBffModule, SqliteDataModule, ScreenCacheModule, MockTelcoModule],
  controllers: [AgentController, HealthController, MetricsController],
  exports: [RATE_LIMITER_PORT],
  providers: [
    {
      provide: INTENT_ROUTING_CONFIG,
      useFactory: (config: ConfigService, logger: PinoLogger): IntentRoutingConfig => {
        return loadIntentRoutingConfig(config, logger);
      },
      inject: [ConfigService, PinoLogger],
    },
    {
      provide: INTENT_CACHE_PORT,
      useFactory: (config: ConfigService): IntentCachePort => {
        return new IntentCacheService(config.get<number>('INTENT_CACHE_THRESHOLD'));
      },
      inject: [ConfigService],
    },
    {
      provide: METRICS_PORT,
      useFactory: (): MetricsPort => new SimpleMetricsAdapter(),
    },
    {
      provide: RATE_LIMITER_PORT,
      useFactory: (): RateLimiterPort => {
        return new InMemoryRateLimiterAdapter();
      },
    },
    {
      provide: IntentRouterService,
      useFactory: (
        intentCache: IntentCachePort,
        intentRoutingConfig: IntentRoutingConfig,
      ): IntentRouterService => {
        return new IntentRouterService(
          intentCache,
          intentRoutingConfig.keywords,
          intentRoutingConfig.actionSignals,
        );
      },
      inject: [INTENT_CACHE_PORT, INTENT_ROUTING_CONFIG],
    },
    {
      provide: SupervisorService,
      useFactory: (
        llm: LlmPort,
        balanceBff: BalanceBffPort,
        bundlesBff: BundlesBffPort,
        usageBff: UsageBffPort,
        supportBff: SupportBffPort,
        storage: ConversationStoragePort,
        cache: ScreenCachePort,
        config: ConfigService,
        logger: PinoLogger,
        intentRouter: IntentRouterService,
        intentRoutingConfig: IntentRoutingConfig,
        telcoService: MockTelcoService,
        metrics: MetricsPort,
      ) => {
        const provider = config.get<string>('LLM_PROVIDER') ?? 'local';
        const modelName = provider === 'dashscope'
          ? config.get<string>('DASHSCOPE_MODEL_NAME')!
          : config.get<string>('LLM_MODEL_NAME')!;
        const circuitBreaker = new CircuitBreakerService();

        const supervisor = new SupervisorService(
          llm,
          modelName,
          config.get<number>('LLM_TEMPERATURE')!,
          config.get<number>('LLM_MAX_TOKENS')!,
          storage,
          logger,
          cache,
          intentRouter,
          circuitBreaker,
          intentRoutingConfig.keywords,
          metrics,
        );

        registerBillingAgents(supervisor, balanceBff);
        registerBundleAgents(supervisor, bundlesBff, balanceBff);
        registerSupportAgents(supervisor, supportBff);
        registerAccountAgents(supervisor, usageBff, telcoService);

        return supervisor;
      },
      inject: [LLM_PORT, BALANCE_BFF_PORT, BUNDLES_BFF_PORT, USAGE_BFF_PORT, SUPPORT_BFF_PORT, CONVERSATION_STORAGE_PORT, SCREEN_CACHE_PORT, ConfigService, PinoLogger, IntentRouterService, INTENT_ROUTING_CONFIG, MockTelcoService, METRICS_PORT],
    },
  ],
})
export class AgentModule {}
