-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingRelationship" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "permissions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingInvite" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "ApiKey_key_idx" ON "ApiKey"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingRelationship_coachId_athleteId_key" ON "CoachingRelationship"("coachId", "athleteId");

-- CreateIndex
CREATE INDEX "CoachingRelationship_coachId_idx" ON "CoachingRelationship"("coachId");

-- CreateIndex
CREATE INDEX "CoachingRelationship_athleteId_idx" ON "CoachingRelationship"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingInvite_code_key" ON "CoachingInvite"("code");

-- CreateIndex
CREATE INDEX "CoachingInvite_code_idx" ON "CoachingInvite"("code");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingRelationship" ADD CONSTRAINT "CoachingRelationship_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingRelationship" ADD CONSTRAINT "CoachingRelationship_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingInvite" ADD CONSTRAINT "CoachingInvite_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN "initialSyncCompleted" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "PlannedWorkout" ADD COLUMN "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PlannedWorkout_shareToken_key" ON "PlannedWorkout"("shareToken");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "altitude" INTEGER,
ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "aiAutoAnalyzeNutrition" SET NOT NULL,
ALTER COLUMN "aiAutoAnalyzeNutrition" SET DEFAULT false,
ALTER COLUMN "aiAutoAnalyzeWorkouts" SET NOT NULL,
ALTER COLUMN "aiAutoAnalyzeWorkouts" SET DEFAULT false;

-- AlterTable
ALTER TABLE "Workout" ADD COLUMN "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Workout_shareToken_key" ON "Workout"("shareToken");
