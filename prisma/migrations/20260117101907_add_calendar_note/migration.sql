-- CreateTable
CREATE TABLE "CalendarNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isWeeklyNote" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "type" TEXT,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'intervals',
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarNote_userId_startDate_idx" ON "CalendarNote"("userId", "startDate");

-- CreateIndex
CREATE INDEX "CalendarNote_userId_isWeeklyNote_idx" ON "CalendarNote"("userId", "isWeeklyNote");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarNote_userId_source_externalId_key" ON "CalendarNote"("userId", "source", "externalId");

-- AddForeignKey
ALTER TABLE "CalendarNote" ADD CONSTRAINT "CalendarNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
