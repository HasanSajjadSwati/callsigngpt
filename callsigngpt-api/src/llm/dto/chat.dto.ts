// src/llm/dto/chat.dto.ts
import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ChatMessageDto {
  @IsIn(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  content!: string;
}

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  // e.g. "basic:gpt-4o-mini"
  model!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  max_tokens?: number;

  @IsOptional()
  @IsBoolean()
  stream?: boolean;
}
