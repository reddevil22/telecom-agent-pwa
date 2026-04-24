import { Module } from "@nestjs/common";
import { DataGiftBffAdapter } from "./data-gift-bff.adapter";
import { DATA_GIFT_BFF_PORT } from "../../../../domain/tokens";
import { MockTelcoModule } from "../../../../infrastructure/telco/mock-telco.module";

@Module({
  imports: [MockTelcoModule],
  providers: [
    {
      provide: DATA_GIFT_BFF_PORT,
      useClass: DataGiftBffAdapter,
    },
  ],
  exports: [DATA_GIFT_BFF_PORT],
})
export class DataGiftBffModule {}
