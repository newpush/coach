-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentFitnessExplanationJson" JSONB,
ADD COLUMN     "recoveryCapacityExplanationJson" JSONB,
ADD COLUMN     "nutritionComplianceExplanationJson" JSONB,
ADD COLUMN     "trainingConsistencyExplanationJson" JSONB;