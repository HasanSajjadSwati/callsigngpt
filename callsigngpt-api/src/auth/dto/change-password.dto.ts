import { IsString, MinLength, MaxLength, NotEquals } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(200)
  oldPassword!: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  @MaxLength(200)
  @NotEquals('oldPassword', { message: 'New password must be different from old password' } as any)
  newPassword!: string;
}
