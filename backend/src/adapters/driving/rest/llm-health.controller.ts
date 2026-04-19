import { Controller, Get } from "@nestjs/common";
import { LlmHealthService } from "../../../infrastructure/llm/llm-health.service";

@Controller("api/health")
export class LlmHealthController {
  constructor(private readonly llmHealthService: LlmHealthService) {}

  @Get("llm")
  async llmHealth() {
    return this.llmHealthService.checkHealth(true);
  }
}
