import { Module } from '@nestjs/common';
import { SCREEN_CACHE_PORT } from '../../domain/tokens';
import { InMemoryScreenCacheAdapter } from './in-memory-screen-cache.adapter';

@Module({
  providers: [
    {
      provide: SCREEN_CACHE_PORT,
      useClass: InMemoryScreenCacheAdapter,
    },
  ],
  exports: [SCREEN_CACHE_PORT],
})
export class ScreenCacheModule {}
