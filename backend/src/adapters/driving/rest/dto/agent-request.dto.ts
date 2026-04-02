import { IsString, IsNumber, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class ConversationMessageDto {
  @IsString()
  role!: 'user' | 'agent';

  @IsString()
  text!: string;

  @IsNumber()
  timestamp!: number;
}

export class AgentRequestDto {
  @IsString()
  prompt!: string;

  @IsString()
  sessionId!: string;

  @IsString()
  userId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationMessageDto)
  conversationHistory!: ConversationMessageDto[];

  @IsNumber()
  timestamp!: number;
}
