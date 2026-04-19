import {
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  MaxLength,
  ArrayMaxSize,
  Min,
  IsIn,
  IsOptional,
} from "class-validator";
import { Type, Transform } from "class-transformer";
import { SECURITY_LIMITS } from "../../../../domain/constants/security-constants";

class ConversationMessageDto {
  @IsIn(["user", "agent"])
  role!: "user" | "agent";

  @IsString()
  @MaxLength(SECURITY_LIMITS.HISTORY_MESSAGE_MAX_LENGTH)
  text!: string;

  @IsNumber()
  @Min(0)
  timestamp!: number;
}

class ConfirmationActionDto {
  @IsString()
  @MaxLength(SECURITY_LIMITS.CONFIRMATION_TOKEN_MAX_LENGTH)
  token!: string;

  @IsIn(["confirm", "cancel"])
  decision!: "confirm" | "cancel";
}

export class AgentRequestDto {
  @IsString()
  @MaxLength(SECURITY_LIMITS.PROMPT_MAX_LENGTH)
  prompt!: string;

  @IsString()
  @MaxLength(SECURITY_LIMITS.SESSION_ID_MAX_LENGTH)
  sessionId!: string;

  @IsString()
  @MaxLength(SECURITY_LIMITS.USER_ID_MAX_LENGTH)
  userId!: string;

  @IsArray()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.slice(-SECURITY_LIMITS.HISTORY_MAX_ENTRIES)
      : value,
  )
  @ArrayMaxSize(SECURITY_LIMITS.HISTORY_MAX_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => ConversationMessageDto)
  conversationHistory!: ConversationMessageDto[];

  @IsNumber()
  @Min(0)
  timestamp!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfirmationActionDto)
  confirmationAction?: ConfirmationActionDto;
}
