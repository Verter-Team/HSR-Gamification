CREATE TYPE "user_role" AS ENUM ('player', 'methodologist', 'supervisor', 'admin');
CREATE TYPE "version_status" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "attempt_status" AS ENUM ('in_progress', 'submitted', 'scored', 'invalid');

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "user_role" NOT NULL DEFAULT 'player',
    "external_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scenarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scenario_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scenario_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "version_status" NOT NULL DEFAULT 'draft',
    "graph" JSONB NOT NULL,
    "lint_report" JSONB,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scenario_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "scenario_version_id" UUID NOT NULL,
    "status" "attempt_status" NOT NULL DEFAULT 'in_progress',
    "outcome" TEXT,
    "score" INTEGER,
    "passed" BOOLEAN,
    "metrics" JSONB,
    "tracks" JSONB,
    "timeouts" INTEGER NOT NULL DEFAULT 0,
    "avg_reaction_ms" INTEGER,
    "client_score" INTEGER,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "scored_at" TIMESTAMPTZ(6),
    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attempt_events" (
    "id" BIGSERIAL NOT NULL,
    "attempt_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "node_id" TEXT NOT NULL,
    "option_id" TEXT,
    "reaction_ms" INTEGER NOT NULL,
    CONSTRAINT "attempt_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "points_ledger" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "track" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "attempt_id" UUID,
    "external_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "points_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_external_id_key" ON "users"("external_id");
CREATE UNIQUE INDEX "scenarios_slug_key" ON "scenarios"("slug");
CREATE UNIQUE INDEX "scenario_versions_scenario_id_version_key" ON "scenario_versions"("scenario_id", "version");
CREATE UNIQUE INDEX "scenario_single_published_idx" ON "scenario_versions"("scenario_id") WHERE "status" = 'published';
CREATE INDEX "attempts_user_id_scored_at_idx" ON "attempts"("user_id", "scored_at" DESC);
CREATE INDEX "attempts_scenario_version_id_idx" ON "attempts"("scenario_version_id");
CREATE UNIQUE INDEX "attempt_events_attempt_id_seq_key" ON "attempt_events"("attempt_id", "seq");
CREATE INDEX "attempt_events_node_id_idx" ON "attempt_events"("node_id");
CREATE INDEX "points_ledger_user_id_created_at_idx" ON "points_ledger"("user_id", "created_at" DESC);
CREATE INDEX "points_ledger_track_created_at_idx" ON "points_ledger"("track", "created_at" DESC);

ALTER TABLE "scenario_versions" ADD CONSTRAINT "scenario_versions_scenario_id_fkey"
    FOREIGN KEY ("scenario_id") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_scenario_version_id_fkey"
    FOREIGN KEY ("scenario_version_id") REFERENCES "scenario_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_events" ADD CONSTRAINT "attempt_events_attempt_id_fkey"
    FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_attempt_id_fkey"
    FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
