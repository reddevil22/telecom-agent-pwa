import { Controller, Get, Delete, Param, Query, NotFoundException, UseGuards, BadRequestException, Inject } from '@nestjs/common';
import type { ConversationStoragePort } from '../../../domain/ports/conversation-storage.port';
import { CONVERSATION_STORAGE_PORT } from '../../../domain/tokens';
import { RateLimitGuard } from './guards/rate-limit.guard';

@Controller('history')
@UseGuards(RateLimitGuard)
export class HistoryController {
  constructor(
    @Inject(CONVERSATION_STORAGE_PORT) private readonly storage: ConversationStoragePort,
  ) {}

  @Get('sessions')
  getSessions(@Query('userId') userId: string, @Query('limit') limit?: string) {
    if (!userId || userId.trim() === '') {
      throw new BadRequestException('userId is required');
    }
    return this.storage.getConversationsByUser(userId, limit ? parseInt(limit, 10) : 10);
  }

  @Get('session/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    const conversation = this.storage.getConversation(sessionId);
    if (!conversation) {
      throw new NotFoundException('Session not found');
    }
    return conversation;
  }

  @Delete('session/:sessionId')
  deleteSession(@Param('sessionId') sessionId: string) {
    const conversation = this.storage.getConversation(sessionId);
    if (!conversation) {
      throw new NotFoundException('Session not found');
    }
    this.storage.softDeleteConversation(conversation.id);
    return { deleted: true, sessionId };
  }
}
