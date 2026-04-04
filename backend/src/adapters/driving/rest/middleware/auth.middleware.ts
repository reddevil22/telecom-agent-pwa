import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * Stub auth middleware for development.
 * Extracts userId from x-user-id header or defaults to 'user-1'.
 * Replace with real auth (JWT, session, etc.) before production.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const userId = (req.headers['x-user-id'] as string) || 'user-1';
    (req as Request & { userId: string }).userId = userId;
    next();
  }
}
