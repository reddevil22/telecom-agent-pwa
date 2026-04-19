import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from "@nestjs/common";
import { Request } from "express";
import { randomUUID } from "crypto";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { PinoLogger } from "nestjs-pino";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {
    this.logger.setContext(LoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();
    const requestContext = request as Request & { correlationId?: string };
    const { method, url } = request;
    const headerCorrelation = request.headers["x-correlation-id"];
    const normalizedHeaderCorrelation = Array.isArray(headerCorrelation)
      ? headerCorrelation[0]
      : headerCorrelation;
    const correlationId =
      requestContext.correlationId ??
      (normalizedHeaderCorrelation &&
      normalizedHeaderCorrelation.trim().length > 0
        ? normalizedHeaderCorrelation
        : randomUUID());
    requestContext.correlationId = correlationId;
    response.setHeader("x-correlation-id", correlationId);
    const startTime = Date.now();

    this.logger.info({ method, url, correlationId }, "Incoming request");

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.info(
            {
              method,
              url,
              statusCode: response.statusCode,
              duration,
              correlationId,
            },
            "Request completed",
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            {
              method,
              url,
              duration,
              correlationId,
              error: error.message,
            },
            "Request failed",
          );
        },
      }),
    );
  }
}
