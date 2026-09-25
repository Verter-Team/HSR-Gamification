import { ApiProperty } from '@nestjs/swagger';

export class LoginUserResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '4471' }) externalId!: string;
  @ApiProperty({ example: 'Проводник №4471' }) displayName!: string;
  @ApiProperty({ example: 'player' }) role!: string;
}

export class LoginResponse {
  @ApiProperty({ description: 'JWT для заголовка Authorization: Bearer <token>' }) accessToken!: string;
  @ApiProperty({ example: 'Bearer' }) tokenType!: string;
  @ApiProperty({ example: 43200, description: 'Время жизни токена в секундах' }) expiresIn!: number;
  @ApiProperty({ type: LoginUserResponse }) user!: LoginUserResponse;
}

export class ScenarioResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'demo-medical-incident' }) slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ format: 'uuid' }) versionId!: string;
  @ApiProperty({ example: 1 }) version!: number;
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Полный граф сценария' }) graph!: object;
}

export class AttemptAcceptedResponse {
  @ApiProperty({ format: 'uuid' }) attemptId!: string;
  @ApiProperty({ example: 'submitted' }) status!: string;
}

export class AttemptResultResponse {
  @ApiProperty({ format: 'uuid' }) attemptId!: string;
  @ApiProperty({ format: 'uuid' }) scenarioVersionId!: string;
  @ApiProperty({ enum: ['submitted', 'scored', 'invalid', 'in_progress'] }) status!: string;
  @ApiProperty({ enum: ['success', 'partial', 'failure'], nullable: true }) outcome!: string | null;
  @ApiProperty({ type: Number, nullable: true }) score!: number | null;
  @ApiProperty({ type: Boolean, nullable: true }) passed!: boolean | null;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' }, nullable: true }) metrics!: object | null;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' }, nullable: true }) tracks!: object | null;
  @ApiProperty() timeouts!: number;
  @ApiProperty({ type: Number, nullable: true }) avgReactionMs!: number | null;
  @ApiProperty({ format: 'date-time' }) startedAt!: Date;
  @ApiProperty({ format: 'date-time', nullable: true }) submittedAt!: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true }) scoredAt!: Date | null;
}

export class AchievementResponse {
  @ApiProperty({ example: 'first-step' }) code!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() icon!: string;
  @ApiProperty({ example: 1 }) tier!: number;
}

export class UserAchievementResponse extends AchievementResponse {
  @ApiProperty({ format: 'date-time', nullable: true }) unlockedAt!: Date | null;
  @ApiProperty({ format: 'uuid', nullable: true }) attemptId!: string | null;
}

export class OrgUnitResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Депо Москва' }) name!: string;
}

export class UserStatsResponse {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: OrgUnitResponse, nullable: true }) orgUnit!: OrgUnitResponse | null;
  @ApiProperty() totalScore!: number;
  @ApiProperty() attemptsCount!: number;
  @ApiProperty() passedCount!: number;
  @ApiProperty({ type: Number, nullable: true }) avgSafety!: number | null;
  @ApiProperty({ type: Number, nullable: true }) avgLoyalty!: number | null;
  @ApiProperty() streakDays!: number;
  @ApiProperty({ format: 'date-time', nullable: true }) lastAttemptAt!: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true }) updatedAt!: Date | null;
}

export class LeaderboardEntryResponse {
  @ApiProperty() rank!: number;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: OrgUnitResponse, nullable: true }) orgUnit!: OrgUnitResponse | null;
  @ApiProperty() totalScore!: number;
  @ApiProperty() attemptsCount!: number;
  @ApiProperty() passedCount!: number;
}

export class LeaderboardResponse {
  @ApiProperty({ enum: ['global', 'depot'] }) scope!: string;
  @ApiProperty({ format: 'uuid', nullable: true }) depotId!: string | null;
  @ApiProperty({ type: [LeaderboardEntryResponse] }) entries!: LeaderboardEntryResponse[];
}
