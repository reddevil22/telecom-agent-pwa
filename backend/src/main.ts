import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableCors({ origin: ['http://localhost:5173', 'http://localhost:3000'] });
  app.setGlobalPrefix('api');
  const port = process.env.PORT || 3001;
  await app.listen(port);
}
bootstrap();
