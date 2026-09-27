import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SubmitReviewDto {
  @ApiProperty({ format: 'uuid', description: 'Зачтённая попытка, к которой относится ответ' })
  @IsUUID()
  attemptId!: string;

  @ApiProperty({ example: 'Понимаю, что хочется к окну. Место закреплено за вашим билетом, но я уточню у начальника поезда и вернусь с ответом через пять минут.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  answer!: string;
}

export class EvaluateReviewDto {
  @ApiProperty({ type: [String], example: ['polite', 'reason', 'action'], description: 'Выполненные критерии чек-листа' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  checks!: string[];

  @ApiProperty({ example: 'Хорошо, что предложили конкретный срок. Не хватило объяснения, почему нельзя пересесть самому.' })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  comment!: string;
}

export class RateReviewDto {
  @ApiProperty({ example: true, description: 'Проверка была полезной' })
  @IsBoolean()
  helpful!: boolean;
}
