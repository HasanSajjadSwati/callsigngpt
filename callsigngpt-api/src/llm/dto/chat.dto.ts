// src/llm/dto/chat.dto.ts
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

// --- Multimodal content parts ---

class TextContentPartDto {
  @IsString()
  @IsIn(['text'])
  type!: 'text';

  @IsString()
  @IsNotEmpty()
  text!: string;
}

class ImageUrlDto {
  @IsString()
  @IsNotEmpty()
  url!: string;
}

class ImageContentPartDto {
  @IsString()
  @IsIn(['image_url'])
  type!: 'image_url';

  @ValidateNested()
  @Type(() => ImageUrlDto)
  image_url!: ImageUrlDto;
}

// --- Message ---

class ChatMessageDto {
  @IsIn(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  /**
   * Content can be a plain string or an array of text/image parts (multimodal).
   * class-validator only validates the form that is actually present.
   */
  @ValidateIf((o) => typeof o.content === 'string')
  @IsString()
  @IsNotEmpty()
  content!: string | (TextContentPartDto | ImageContentPartDto)[];

  // When content is an array, validate each element
  @ValidateIf((o) => Array.isArray(o.content))
  @IsArray()
  @ValidateNested({ each: true })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    return value.map((part: any) => {
      if (part?.type === 'image_url') {
        return Object.assign(new ImageContentPartDto(), part);
      }
      return Object.assign(new TextContentPartDto(), part);
    });
  })
  contentArray?: (TextContentPartDto | ImageContentPartDto)[];
}

// --- Search options ---

class SearchOptionsDto {
  @IsOptional()
  @IsIn(['auto', 'always', 'off'])
  mode?: 'auto' | 'always' | 'off';
}

// --- Main DTO ---

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

  @IsOptional()
  @ValidateNested()
  @Type(() => SearchOptionsDto)
  search?: SearchOptionsDto;

  @IsOptional()
  @IsBoolean()
  forceSearch?: boolean;
}
