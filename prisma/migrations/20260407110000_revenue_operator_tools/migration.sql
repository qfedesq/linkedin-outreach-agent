-- CreateTable
CREATE TABLE "MessageExperiment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "goal" TEXT NOT NULL,
    "audienceFilter" TEXT,
    "hypothesis" TEXT NOT NULL,
    "variantsJson" JSONB NOT NULL,
    "successMetric" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "campaignId" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageExperiment_userId_campaignId_createdAt_idx" ON "MessageExperiment"("userId", "campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageExperiment_userId_status_createdAt_idx" ON "MessageExperiment"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ContactInsight_userId_contactId_kind_createdAt_idx" ON "ContactInsight"("userId", "contactId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ContactInsight_userId_campaignId_kind_createdAt_idx" ON "ContactInsight"("userId", "campaignId", "kind", "createdAt");
