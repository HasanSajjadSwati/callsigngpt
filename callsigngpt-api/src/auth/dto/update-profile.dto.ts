import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[\d+()\-\s]{6,32}$/, {
    message: 'Phone must be 6-32 chars and contain only digits, spaces, parentheses, +, -',
  })
  phone?: string;
}
