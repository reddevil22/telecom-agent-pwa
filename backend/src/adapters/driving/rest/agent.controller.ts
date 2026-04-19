import {
  Controller,
  Post,
  Body,
  Get,
  Header,
  UseGuards,
  Req,
  Res,
} from "@nestjs/common";
import { AgentRequestDto } from "./dto/agent-request.dto";
import { SupervisorService } from "../../../application/supervisor/supervisor.service";
import { PromptSanitizerPipe } from "./pipes/prompt-sanitizer.pipe";
import { RateLimitGuard } from "./guards/rate-limit.guard";
import type { AgentResponse } from "../../../domain/types/agent";
import { QUICK_ACTIONS } from "./quick-actions.config";
import type { Request, Response } from "express";
import { PinoLogger } from "nestjs-pino";

type AuthedRequest = Request & { userId?: string };

@Controller("api/agent")
@UseGuards(RateLimitGuard)
export class AgentController {
  constructor(
    private readonly supervisor: SupervisorService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AgentController.name);
  }

  @Post("chat")
  async chat(
    @Req() req: AuthedRequest,
    @Body(new PromptSanitizerPipe()) dto: AgentRequestDto,
  ): Promise<AgentResponse> {
    dto.userId = req.userId ?? dto.userId;
    let finalResponse: AgentResponse | undefined;
    for await (const event of this.supervisor.processRequest(dto)) {
      if ("screenType" in event) {
        finalResponse = event;
      }
    }
    return finalResponse as AgentResponse;
  }

  @Post("chat/stream")
  async chatStream(
    @Req() req: AuthedRequest,
    @Body(new PromptSanitizerPipe()) dto: AgentRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    dto.userId = req.userId ?? dto.userId;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    try {
      for await (const event of this.supervisor.processRequest(dto)) {
        if ("screenType" in event) {
          // Final AgentResponse
          res.write(`event: result\ndata: ${JSON.stringify(event)}\n\n`);
        } else {
          // ProcessingStep
          res.write(`event: step\ndata: ${JSON.stringify(event)}\n\n`);
        }
      }
    } catch (error) {
      this.logger.error(
        {
          err:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : String(error),
        },
        "SSE stream processing failed",
      );
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: "Processing failed" })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  @Get("status")
  @Header("Cache-Control", "no-store")
  getStatus() {
    const { available, state } = this.supervisor.getLlmStatus();
    return {
      llm: available ? "available" : "unavailable",
      mode: available ? "normal" : "degraded",
      circuitState: state,
    };
  }

  @Get("quick-actions")
  @Header("Cache-Control", "public, max-age=300")
  getQuickActions() {
    return { actions: QUICK_ACTIONS };
  }
}

@Controller("api/health")
export class HealthController {
  @Get()
  health() {
    return { status: "ok" };
  }

  @Get("live")
  liveness() {
    return { status: "ok" };
  }

  @Get("ready")
  readiness() {
    // Basic readiness — if we got here, the app is initialized and routes are registered
    return { status: "ok" };
  }
}
