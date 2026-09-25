CREATE TABLE "org_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "region" TEXT,
    CONSTRAINT "org_units_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "users" ADD COLUMN "org_unit_id" UUID;

CREATE TABLE "achievements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "tier" SMALLINT NOT NULL DEFAULT 1,
    "rule" JSONB NOT NULL,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_achievements" (
    "user_id" UUID NOT NULL,
    "achievement_id" UUID NOT NULL,
    "unlocked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_id" UUID,
    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("user_id", "achievement_id")
);

CREATE TABLE "user_stats" (
    "user_id" UUID NOT NULL,
    "total_score" INTEGER NOT NULL DEFAULT 0,
    "attempts_count" INTEGER NOT NULL DEFAULT 0,
    "passed_count" INTEGER NOT NULL DEFAULT 0,
    "avg_safety" DECIMAL(5,2),
    "avg_loyalty" DECIMAL(5,2),
    "streak_days" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("user_id")
);

CREATE UNIQUE INDEX "org_units_name_key" ON "org_units"("name");
CREATE INDEX "users_org_unit_id_idx" ON "users"("org_unit_id");
CREATE UNIQUE INDEX "achievements_code_key" ON "achievements"("code");
CREATE INDEX "user_stats_total_score_attempts_count_idx" ON "user_stats"("total_score" DESC, "attempts_count");

ALTER TABLE "users" ADD CONSTRAINT "users_org_unit_id_fkey"
    FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_fkey"
    FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_attempt_id_fkey"
    FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
