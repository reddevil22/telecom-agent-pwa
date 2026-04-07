import { Injectable } from '@nestjs/common';
import type { SupportBffPort } from '../../../../domain/ports/bff-ports';
import type { SupportTicket } from '../../../../domain/types/domain';
import { MockTelcoService } from '../../../../infrastructure/telco/mock-telco.service';

@Injectable()
export class MockTelcoSupportBffAdapter implements SupportBffPort {
  constructor(private readonly telco: MockTelcoService) {}

  async getTickets(userId: string): Promise<SupportTicket[]> {
    return this.telco.getTickets(userId);
  }

  async getFaq(): Promise<Array<{ question: string; answer: string }>> {
    return this.telco.getFaq();
  }

  async createTicket(userId: string, subject: string, description: string): Promise<SupportTicket> {
    return this.telco.createTicket(userId, subject, description);
  }
}
