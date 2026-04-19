import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule as NestPinoLoggerModule } from "nestjs-pino";

@Module({
  imports: [
    ConfigModule,
    NestPinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>("LOG_LEVEL", "info"),
          transport:
            config.get<string>("NODE_ENV") !== "production"
              ? { target: "pino-pretty" }
              : undefined,
          redact: ["req.headers.authorization"],
          autoLogging: false,
        },
      }),
    }),
  ],
})
export class LoggerModule {}
