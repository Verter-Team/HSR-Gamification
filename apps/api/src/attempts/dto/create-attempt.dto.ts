import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DecisionEventDto {
  @ApiProperty({ example: 0, description: 'Порядок решения в попытке' })
  @IsInt()
  @Min(0)
  @Max(99)
  seq!: number;

  @ApiProperty({ example: 'first_choice' })
  @IsString()
  @MaxLength(128)
  nodeId!: string;

  @ApiPropertyOptional({ example: 'call_help', nullable: true, description: 'null при истечении таймера' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  optionId?: string | null;

  @ApiProperty({ example: 1800, description: 'Время реакции в миллисекундах' })
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  reactionMs!: number;
}

export class CreateAttemptDto {
  @ApiProperty({ format: 'uuid', description: 'UUID, созданный клиентом для идемпотентной отправки' })
  @IsUUID()
  attemptId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  scenarioVersionId!: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-25T12:00:00.000Z' })
  @IsISO8601({ strict: true })
  startedAt!: string;

  @ApiPropertyOptional({ example: 220 })
  @IsOptional()
  @IsInt()
  @Min(-2_147_483_648)
  @Max(2_147_483_647)
  clientScore?: number;

  @ApiProperty({ type: [DecisionEventDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DecisionEventDto)
  events!: DecisionEventDto[];
}
