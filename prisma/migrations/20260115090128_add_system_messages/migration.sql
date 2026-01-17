-- CreateTable
CREATE TABLE "SystemMessage" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSystemMessageDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "systemMessageId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSystemMessageDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSystemMessageDismissal_userId_idx" ON "UserSystemMessageDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSystemMessageDismissal_userId_systemMessageId_key" ON "UserSystemMessageDismissal"("userId", "systemMessageId");

-- AddForeignKey
ALTER TABLE "UserSystemMessageDismissal" ADD CONSTRAINT "UserSystemMessageDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSystemMessageDismissal" ADD CONSTRAINT "UserSystemMessageDismissal_systemMessageId_fkey" FOREIGN KEY ("systemMessageId") REFERENCES "SystemMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
