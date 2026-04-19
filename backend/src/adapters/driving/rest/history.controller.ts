import { Controller, Get, Delete, Param, Query, NotFoundException, UseGuards, Inject, Req, ForbiddenException } from '@nestjs/common';
import type { ConversationStoragePort } from '../../../domain/ports/conversation-storage.port';
import { CONVERSATION_STORAGE_PORT } from '../../../domain/tokens';
import { RateLimitGuard } from './guards/rate-limit.guard';
import type { Request } from 'express';

type AuthedRequest = Request & { userId?: string };

@Controller('api/history')
@UseGuards(RateLimitGuard)
export class HistoryController {
  constructor(
    @Inject(CONVERSATION_STORAGE_PORT) private readonly storage: ConversationStoragePort,
  ) {}

  private getAuthenticatedUserId(req: AuthedRequest): string {
    const userId = req.userId;
    if (!userId || userId.trim() === '') {
      throw new ForbiddenException('Missing authenticated user');
    }
    return userId;
  }

  @Get('sessions')
  getSessions(
    @Req() req: AuthedRequest,
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const authUserId = this.getAuthenticatedUserId(req);
    if (!userId || userId.trim() === '') {
      return this.storage.getConversationsByUser(authUserId, limit ? parseInt(limit, 10) : 10);
    }
    if (userId !== authUserId) {
      throw new ForbiddenException('Cannot access sessions for another user');
    }
    return this.storage.getConversationsByUser(authUserId, limit ? parseInt(limit, 10) : 10);
  }

  @Get('session/:sessionId')
  getSession(@Req() req: AuthedRequest, @Param('sessionId') sessionId: string) {
    const authUserId = this.getAuthenticatedUserId(req);
    const conversation = this.storage.getConversation(sessionId, authUserId);
    if (!conversation) {
      throw new NotFoundException('Session not found');
    }
    return conversation;
  }

  @Delete('session/:sessionId')
  deleteSession(@Req() req: AuthedRequest, @Param('sessionId') sessionId: string) {
    const authUserId = this.getAuthenticatedUserId(req);
    const conversation = this.storage.getConversation(sessionId, authUserId);
    if (!conversation) {
      throw new NotFoundException('Session not found');
    }
    this.storage.softDeleteConversation(conversation.id);
    return { deleted: true, sessionId };
  }
}
