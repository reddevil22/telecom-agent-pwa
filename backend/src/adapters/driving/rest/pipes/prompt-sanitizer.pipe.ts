import { PipeTransform, BadRequestException } from '@nestjs/common';
import { AgentRequestDto } from '../dto/agent-request.dto';
import { BLOCKED_PATTERNS } from '../../../../domain/constants/security-constants';

export class PromptSanitizerPipe implements PipeTransform<AgentRequestDto, AgentRequestDto> {
  transform(value: AgentRequestDto): AgentRequestDto {
    value.prompt = this.sanitize(value.prompt);

    for (const msg of value.conversationHistory) {
      msg.text = this.sanitize(msg.text);
    }

    return value;
  }

  private sanitize(text: string): string {
    // Strip control characters (keep \n, \r, \t)
    let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Collapse excessive whitespace (100+ spaces/tabs → 50 spaces)
    cleaned = cleaned.replace(/[ \t]{100,}/g, ' '.repeat(50));

    // Check for blocked injection patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(cleaned)) {
        throw new BadRequestException('Prompt contains disallowed content');
      }
    }

    return cleaned;
  }
}
