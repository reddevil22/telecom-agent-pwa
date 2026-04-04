import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { AgentController, HealthController } from './adapters/driving/rest/agent.controller';
import { SupervisorService } from './application/supervisor/supervisor.service';
import { LlmModule } from './adapters/driven/llm/llm.module';
import { BalanceBffModule } from './adapters/driven/bff/balance/balance-bff.module';
import { BundlesBffModule } from './adapters/driven/bff/bundles/bundles-bff.module';
import { UsageBffModule } from './adapters/driven/bff/usage/usage-bff.module';
import { SupportBffModule } from './adapters/driven/bff/support/support-bff.module';
import { SqliteDataModule } from './infrastructure/data/sqlite-data.module';
import { SimpleQuerySubAgent, DualQuerySubAgent, ActionSubAgent } from './application/sub-agents/generic-sub-agents';
import { PurchaseBundleSubAgent } from './application/sub-agents/purchase-bundle-sub-agent.service';
import { CreateTicketSubAgent } from './application/sub-agents/create-ticket-sub-agent.service';
import { ViewBundleDetailsSubAgent } from './application/sub-agents/view-bundle-details-sub-agent.service';
import { LLM_PORT, BALANCE_BFF_PORT, BUNDLES_BFF_PORT, USAGE_BFF_PORT, SUPPORT_BFF_PORT, CONVERSATION_STORAGE_PORT } from './domain/tokens';
import type { LlmPort } from './domain/ports/llm.port';
import type { BalanceBffPort, BundlesBffPort, UsageBffPort, SupportBffPort } from './domain/ports/bff-ports';
import type { ConversationStoragePort } from './domain/ports/conversation-storage.port';
import type { SubAgentPort } from './domain/ports/sub-agent.port';

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
        const provider = config.get<string>('LLM_PROVIDER') ?? 'local';
        const modelName = provider === 'dashscope'
          ? config.get<string>('DASHSCOPE_MODEL_NAME')!
          : config.get<string>('LLM_MODEL_NAME')!;

        const supervisor = new SupervisorService(
          llm,
          modelName,
          config.get<number>('LLM_TEMPERATURE')!,
          config.get<number>('LLM_MAX_TOKENS')!,
          storage,
          logger,
        );

        // Simple query sub-agents (read-only operations)
        supervisor.registerAgent('check_balance', new SimpleQuerySubAgent(
          (userId) => balanceBff.getBalance(userId),
          {
            screenType: 'balance',
            processingLabels: { fetching: 'Fetching account balance' },
            transformResult: (balance) => ({ balance }),
          }
        ) as SubAgentPort);

        supervisor.registerAgent('list_bundles', new SimpleQuerySubAgent(
          (userId) => bundlesBff.getBundles(userId),
          {
            screenType: 'bundles',
            processingLabels: { fetching: 'Retrieving available bundles' },
            transformResult: (bundles) => ({ bundles }),
          }
        ) as SubAgentPort);

        supervisor.registerAgent('check_usage', new SimpleQuerySubAgent(
          (userId) => usageBff.getUsage(userId),
          {
            screenType: 'usage',
            processingLabels: { fetching: 'Fetching usage data' },
            transformResult: (usage) => ({ usage }),
          }
        ) as SubAgentPort);

        // Dual query sub-agents (requires two BFF calls)
        supervisor.registerAgent('view_bundle_details', new ViewBundleDetailsSubAgent(bundlesBff, balanceBff));

        supervisor.registerAgent('get_support', new DualQuerySubAgent(
          (userId) => supportBff.getTickets(userId),
          () => supportBff.getFaq(),
          {
            screenType: 'support',
            processingLabels: { primary: 'Loading support options', secondary: 'Loading FAQ' },
            transformResult: (tickets, faqItems) => ({ tickets, faqItems }),
          }
        ) as SubAgentPort);

        // Keep complex sub-agents that need custom logic
        supervisor.registerAgent('purchase_bundle', new PurchaseBundleSubAgent(bundlesBff));
        supervisor.registerAgent('create_ticket', new CreateTicketSubAgent(supportBff));

        // Action sub-agent for top-up
        supervisor.registerAgent('top_up', new ActionSubAgent({
          screenType: 'confirmation',
          validateParams: (params) => {
            const amount = parseFloat(params?.['amount'] ?? '0');
            if (isNaN(amount) || amount <= 0) {
              return { isValid: false, error: 'Invalid amount. Please specify a positive number to top up.' };
            }
            return { isValid: true, extractedParams: { amount: amount.toString() } };
          },
          executeAction: async (userId, params) => {
            const amount = parseFloat(params.amount);
            const updated = await balanceBff.topUp(userId, amount);
            return {
              success: true,
              title: 'Top-up Successful!',
              message: `${updated.currency} ${amount.toFixed(2)} has been added to your balance.`,
              details: {
                amountAdded: `${updated.currency} ${amount.toFixed(2)}`,
                newBalance: `${updated.currency} ${updated.current.toFixed(2)}`,
              },
              updatedBalance: updated,
            };
          },
          processingLabels: { validating: 'Validating amount', processing: 'Processing top-up', updating: 'Updating balance' },
        }) as SubAgentPort);

        return supervisor;
      },
      inject: [LLM_PORT, BALANCE_BFF_PORT, BUNDLES_BFF_PORT, USAGE_BFF_PORT, SUPPORT_BFF_PORT, CONVERSATION_STORAGE_PORT, ConfigService, PinoLogger],
    },
  ],
})
export class AgentModule {}
