import { Injectable } from "@nestjs/common";
import { MockTelcoService } from "../../../../infrastructure/telco/mock-telco.service";
import type { DataGiftBffPort, DataTransferResult } from "../../../../domain/ports/bff-ports";

@Injectable()
export class DataGiftBffAdapter implements DataGiftBffPort {
  constructor(private readonly telco: MockTelcoService) {}

  async resolveRecipient(userId: string, query: string) {
    return this.telco.resolveRecipient(query);
  }

  async validateAllowance(userId: string, amountMb: number) {
    return this.telco.validateDataAllowance(userId, amountMb);
  }

  async transferData(senderId: string, recipientId: string, amountMb: number): Promise<DataTransferResult> {
    return this.telco.transferData(senderId, recipientId, amountMb);
  }
}
