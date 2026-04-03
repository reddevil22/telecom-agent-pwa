import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './infrastructure/interceptors/logging.interceptor';
import { AllExceptionsFilter } from './infrastructure/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({ origin: ['http://localhost:5173', 'http://localhost:3000'] });
  app.setGlobalPrefix('api');

  // Resolve request-scoped PinoLogger for global interceptor and filter
  const [interceptor, filter] = await Promise.all([
    app.resolve(LoggingInterceptor),
    app.resolve(AllExceptionsFilter),
  ]);
  app.useGlobalInterceptors(interceptor);
  app.useGlobalFilters(filter);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  app.get(Logger).log(`Server listening on port ${port}`);
}
bootstrap();
