import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '4471', description: 'Табельный номер' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  externalId!: string;

  @ApiProperty({ example: 'demo', format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}
