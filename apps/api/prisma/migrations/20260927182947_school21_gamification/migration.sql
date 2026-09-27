-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('pending', 'reviewed');

-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN     "branch" TEXT,
ADD COLUMN     "difficulty" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "estimated_minutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "requires" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "tier" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xp_reward" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "user_stats" ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "review_points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviews_given" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tribe_id" UUID;

-- CreateTable
CREATE TABLE "tribes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "motto" TEXT NOT NULL,

    CONSTRAINT "tribes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peer_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "scenario_id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "checklist" JSONB NOT NULL,
    "answer" TEXT NOT NULL,
    "status" "review_status" NOT NULL DEFAULT 'pending',
    "reviewer_id" UUID,
    "checks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comment" TEXT,
    "helpful" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),
    "rated_at" TIMESTAMPTZ(6),

    CONSTRAINT "peer_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "shop_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "price" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tribes_slug_key" ON "tribes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "peer_reviews_attempt_id_key" ON "peer_reviews"("attempt_id");

-- CreateIndex
CREATE INDEX "peer_reviews_status_created_at_idx" ON "peer_reviews"("status", "created_at");

-- CreateIndex
CREATE INDEX "peer_reviews_author_id_created_at_idx" ON "peer_reviews"("author_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "peer_reviews_reviewer_id_idx" ON "peer_reviews"("reviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_items_code_key" ON "shop_items"("code");

-- CreateIndex
CREATE INDEX "purchases_user_id_created_at_idx" ON "purchases"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_stats_xp_idx" ON "user_stats"("xp" DESC);

-- CreateIndex
CREATE INDEX "users_tribe_id_idx" ON "users"("tribe_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tribe_id_fkey" FOREIGN KEY ("tribe_id") REFERENCES "tribes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_reviews" ADD CONSTRAINT "peer_reviews_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_reviews" ADD CONSTRAINT "peer_reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_reviews" ADD CONSTRAINT "peer_reviews_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_reviews" ADD CONSTRAINT "peer_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "shop_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
