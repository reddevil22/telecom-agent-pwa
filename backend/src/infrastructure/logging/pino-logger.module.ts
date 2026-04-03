import { Module } from '@nestjs/common';
import { LoggerModule as NestPinoLoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    NestPinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
        redact: ['req.headers.authorization'],
        autoLogging: false, // we handle request/response logging in our interceptor
      },
    }),
  ],
})
export class LoggerModule {}
