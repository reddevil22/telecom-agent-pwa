import { IsString, IsNumber, IsArray, ValidateNested, IsOptional, MaxLength, ArrayMaxSize, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SECURITY_LIMITS } from '../../../../domain/constants/security-constants';

class ConversationMessageDto {
  @IsString()
  role!: 'user' | 'agent';

  @IsString()
  @MaxLength(SECURITY_LIMITS.HISTORY_MESSAGE_MAX_LENGTH)
  text!: string;

  @IsNumber()
  @Min(0)
  timestamp!: number;
}

export class AgentRequestDto {
  @IsString()
  @MaxLength(SECURITY_LIMITS.PROMPT_MAX_LENGTH)
  prompt!: string;

  @IsString()
  sessionId!: string;

  @IsString()
  userId!: string;

  @IsArray()
  @ArrayMaxSize(SECURITY_LIMITS.HISTORY_MAX_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => ConversationMessageDto)
  conversationHistory!: ConversationMessageDto[];

  @IsNumber()
  @Min(0)
  timestamp!: number;
}
