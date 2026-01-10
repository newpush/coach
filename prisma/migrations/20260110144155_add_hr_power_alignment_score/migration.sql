-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hrPowerAlignmentExplanation" TEXT,
ADD COLUMN     "hrPowerAlignmentExplanationJson" JSONB,
ADD COLUMN     "hrPowerAlignmentScore" INTEGER;
