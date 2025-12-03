-- AlterTable
ALTER TABLE "Nutrition" ADD COLUMN     "aiAnalysis" TEXT,
ADD COLUMN     "aiAnalysisJson" JSONB,
ADD COLUMN     "aiAnalysisStatus" TEXT DEFAULT 'NOT_STARTED',
ADD COLUMN     "aiAnalyzedAt" TIMESTAMP(3);
