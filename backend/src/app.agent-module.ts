import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AgentController, HealthController } from './adapters/driving/rest/agent.controller';
import { SupervisorService } from './application/supervisor/supervisor.service';
import { StreamingSupervisorService } from './application/supervisor/streaming-supervisor.service';
import { BalanceSubAgent } from './application/sub-agents/balance-sub-agent.service';
import { BundlesSubAgent } from './application/sub-agents/bundles-sub-agent.service';
import { UsageSubAgent } from './application/sub-agents/usage-sub-agent.service';
import { SupportSubAgent } from './application/sub-agents/support-sub-agent.service';
import { PurchaseBundleSubAgent } from './application/sub-agents/purchase-bundle-sub-agent.service';
import { TopUpSubAgent } from './application/sub-agents/topup-sub-agent.service';
import { CreateTicketSubAgent } from './application/sub-agents/create-ticket-sub-agent.service';
import { LLM_PORT, BALANCE_BFF_PORT, BUNDLES_BFF_PORT, USAGE_BFF_PORT, SUPPORT_BFF_PORT, CONVERSATION_STORAGE_PORT } from './domain/tokens';
import { LlmModule } from './adapters/driven/llm/llm.module';
import { BalanceBffModule } from './adapters/driven/bff/balance/balance-bff.module';
import { BundlesBffModule } from './adapters/driven/bff/bundles/bundles-bff.module';
import { UsageBffModule } from './adapters/driven/bff/usage/usage-bff.module';
import { SupportBffModule } from './adapters/driven/bff/support/support-bff.module';
import { SqliteDataModule } from './infrastructure/data/sqlite-data.module';
import type { LlmPort } from './domain/ports/llm.port';
import type { BalanceBffPort, BundlesBffPort, UsageBffPort, SupportBffPort } from './domain/ports/bff-ports';
import type { ConversationStoragePort } from './domain/ports/conversation-storage.port';

@Module({
  imports: [LlmModule, BalanceBffModule, BundlesBffModule, UsageBffModule, SupportBffModule, SqliteDataModule],
  controllers: [AgentController, HealthController],
  providers: [
    {
      provide: SupervisorService,
      useFactory: (
        llm: LlmPort,
        balanceBff: BalanceBffPort,
        bundlesBff: BundlesBffPort,
        usageBff: UsageBffPort,
        supportBff: SupportBffPort,
        storage: ConversationStoragePort,
        config: ConfigService,
        logger: PinoLogger,
      ) => {
        const supervisor = new SupervisorService(
          llm,
          config.get<string>('LLM_MODEL_NAME')!,
          config.get<number>('LLM_TEMPERATURE')!,
          config.get<number>('LLM_MAX_TOKENS')!,
          storage,
          logger,
        );
        supervisor.registerAgent('check_balance', new BalanceSubAgent(balanceBff));
        supervisor.registerAgent('list_bundles', new BundlesSubAgent(bundlesBff));
        supervisor.registerAgent('check_usage', new UsageSubAgent(usageBff));
        supervisor.registerAgent('get_support', new SupportSubAgent(supportBff));
        supervisor.registerAgent('purchase_bundle', new PurchaseBundleSubAgent(bundlesBff));
        supervisor.registerAgent('top_up', new TopUpSubAgent(balanceBff));
        supervisor.registerAgent('create_ticket', new CreateTicketSubAgent(supportBff));
        return supervisor;
      },
      inject: [LLM_PORT, BALANCE_BFF_PORT, BUNDLES_BFF_PORT, USAGE_BFF_PORT, SUPPORT_BFF_PORT, CONVERSATION_STORAGE_PORT, ConfigService, PinoLogger],
    },
    {
      provide: StreamingSupervisorService,
      useFactory: (supervisor: SupervisorService, logger: PinoLogger) => {
        return new StreamingSupervisorService(supervisor, logger);
      },
      inject: [SupervisorService, PinoLogger],
    },
  ],
})
export class AgentModule {}
