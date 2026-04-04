import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { ScreenData, ProcessingStep, ScreenType } from '../../domain/types/agent';
import type { Balance } from '../../domain/types/domain';
import { ProcessingStepLabels, ConfirmationTitles } from '../../domain/constants/processing-steps'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BffMethod = (userId: string) => Promise<any>;

export interface SimpleQueryConfig {
  screenType: ScreenType;
  processingLabels: {
    fetching: string;
  };
  transformResult: (result: unknown) => Record<string, unknown>;
}

export class SimpleQuerySubAgent implements SubAgentPort {
  constructor(
    private readonly bffMethod: BffMethod,
    private readonly config: SimpleQueryConfig,
  ) {}

  async handle(userId: string): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }> {
    const result = await this.bffMethod(userId);

    return {
      screenData: {
        type: this.config.screenType,
        ...this.config.transformResult(result),
      } as ScreenData,
      processingSteps: [
        { label: ProcessingStepLabels.UNDERSTAND, status: 'done' },
        { label: this.config.processingLabels.fetching, status: 'done' },
        { label: ProcessingStepLabels.PREPARING, status: 'done' },
      ],
    };
  }
}

export interface ActionConfig<TParams extends Record<string, string>> {
  screenType: 'confirmation';
  validateParams: (params?: Record<string, string>) => { isValid: boolean; error?: string; extractedParams?: TParams };
  executeAction: (userId: string, params: TParams) => Promise<{
    success: boolean;
    title: string;
    message: string;
    details: Record<string, string | number>;
    updatedBalance?: Balance;
  }>;
  processingLabels: {
    validating: string;
    processing: string;
    updating?: string;
  };
}

export class ActionSubAgent<TParams extends Record<string, string>> implements SubAgentPort {
  constructor(
    private readonly config: ActionConfig<TParams>,
  ) {}

  async handle(userId: string, params?: Record<string, string>): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }> {
    const validation = this.config.validateParams(params);

    if (!validation.isValid) {
      return {
        screenData: {
          type: 'confirmation',
          title: ConfirmationTitles.FAILED,
          status: 'error',
          message: validation.error ?? 'Invalid request',
          details: {},
        },
        processingSteps: [
          { label: this.config.processingLabels.validating, status: 'done' },
        ],
      };
    }

    const result = await this.config.executeAction(userId, validation.extractedParams!);

    const steps: ProcessingStep[] = [
      { label: this.config.processingLabels.validating, status: 'done' },
      { label: this.config.processingLabels.processing, status: 'done' },
    ];

    if (this.config.processingLabels.updating) {
      steps.push({ label: this.config.processingLabels.updating, status: 'done' });
    }

    return {
      screenData: {
        type: 'confirmation',
        title: result.title,
        status: result.success ? 'success' : 'error',
        message: result.message,
        details: result.details,
        ...(result.updatedBalance ? { updatedBalance: result.updatedBalance } : {}),
      },
      processingSteps: steps,
    };
  }
}

export interface DualQueryConfig {
  screenType: ScreenType;
  processingLabels: {
    primary: string;
    secondary: string;
  };
  transformResult: (primary: unknown, secondary: unknown) => Record<string, unknown>;
}

export class DualQuerySubAgent implements SubAgentPort {
  constructor(
    private readonly primaryBffMethod: BffMethod,
    private readonly secondaryBffMethod: BffMethod,
    private readonly config: DualQueryConfig,
  ) {}

  async handle(userId: string): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }> {
    const [primary, secondary] = await Promise.all([
      this.primaryBffMethod(userId),
      this.secondaryBffMethod(userId),
    ]);

    return {
      screenData: {
        type: this.config.screenType,
        ...this.config.transformResult(primary, secondary),
      } as ScreenData,
      processingSteps: [
        { label: ProcessingStepLabels.UNDERSTAND, status: 'done' },
        { label: this.config.processingLabels.primary, status: 'done' },
        { label: this.config.processingLabels.secondary, status: 'done' },
        { label: ProcessingStepLabels.PREPARING, status: 'done' },
      ],
    };
  }
}
