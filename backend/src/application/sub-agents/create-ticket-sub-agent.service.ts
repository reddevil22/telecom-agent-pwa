import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { SupportBffPort } from '../../domain/ports/bff-ports';
import type { ScreenData, ProcessingStep } from '../../domain/types/agent';

export class CreateTicketSubAgent implements SubAgentPort {
  constructor(private readonly supportBff: SupportBffPort) {}

  async handle(userId: string, params?: Record<string, string>): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }> {
    const subject = params?.['subject'] ?? 'General Inquiry';
    const description = params?.['description'] ?? '';

    const ticket = await this.supportBff.createTicket(userId, subject, description);

    return {
      screenData: {
        type: 'confirmation',
        title: 'Support Ticket Created',
        status: 'success',
        message: `Your support ticket has been created successfully. Our team will review your issue shortly.`,
        details: {
          ticketId: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
        },
      },
      processingSteps: [
        { label: 'Creating ticket', status: 'done' },
        { label: 'Confirming submission', status: 'done' },
      ],
    };
  }
}
