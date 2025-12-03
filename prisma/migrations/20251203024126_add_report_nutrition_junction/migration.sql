-- CreateTable
CREATE TABLE "ReportNutrition" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "nutritionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportNutrition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportNutrition_reportId_idx" ON "ReportNutrition"("reportId");

-- CreateIndex
CREATE INDEX "ReportNutrition_nutritionId_idx" ON "ReportNutrition"("nutritionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportNutrition_reportId_nutritionId_key" ON "ReportNutrition"("reportId", "nutritionId");

-- AddForeignKey
ALTER TABLE "ReportNutrition" ADD CONSTRAINT "ReportNutrition_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportNutrition" ADD CONSTRAINT "ReportNutrition_nutritionId_fkey" FOREIGN KEY ("nutritionId") REFERENCES "Nutrition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
