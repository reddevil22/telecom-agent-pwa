import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { envValidationSchema } from './env.validation';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: (config) => {
        const validated: Record<string, unknown> = {};
        for (const [key, schema] of Object.entries(envValidationSchema)) {
          const raw = config[key] ?? (schema as { default: unknown }).default;
          validated[key] = (schema as { type: string }).type === 'number' ? Number(raw) : raw;
        }
        return validated;
      },
    }),
  ],
})
export class ConfigModule {}
