import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {
    this.logger.setContext(LoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const correlationId = (request as unknown as Record<string, unknown>)['correlationId'] as string | undefined;
    const startTime = Date.now();

    this.logger.info({ method, url, correlationId }, 'Incoming request');

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const response = context.switchToHttp().getResponse();
          this.logger.info({
            method,
            url,
            statusCode: response.statusCode,
            duration,
            correlationId,
          }, 'Request completed');
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error({
            method,
            url,
            duration,
            correlationId,
            error: error.message,
          }, 'Request failed');
        },
      }),
    );
  }
}
