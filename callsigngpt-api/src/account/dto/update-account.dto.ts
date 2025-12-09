import { IsOptional, IsString, MaxLength, Matches, IsIn } from 'class-validator';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  // very loose phone check; adjust to your locale
  @Matches(/^[\d+()\-\s]{6,32}$/)
  phone?: string;
}
