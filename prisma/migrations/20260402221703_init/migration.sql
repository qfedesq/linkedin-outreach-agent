-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "linkedinLiAt" TEXT,
    "linkedinCsrfToken" TEXT,
    "linkedinProfileUrn" TEXT,
    "linkedinCookieValid" BOOLEAN NOT NULL DEFAULT false,
    "linkedinLastValidated" DATETIME,
    "apifyApiToken" TEXT,
    "openrouterApiKey" TEXT,
    "googleSheetsId" TEXT,
    "googleServiceAccount" TEXT,
    "calendarBookingUrl" TEXT NOT NULL DEFAULT 'https://calendar.app.google/k8XEhkPnX6sc2GdW9',
    "preferredModel" TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4',
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "company" TEXT,
    "linkedinUrl" TEXT NOT NULL,
    "linkedinSlug" TEXT,
    "linkedinProfileId" TEXT,
    "linkedinTrackingId" TEXT,
    "linkedinEntityUrn" TEXT,
    "companyDescription" TEXT,
    "connectionMessage" TEXT,
    "profileFit" TEXT NOT NULL DEFAULT 'MEDIUM',
    "fitRationale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TO_CONTACT',
    "inviteSentDate" DATETIME,
    "connectedDate" DATETIME,
    "followupSentDate" DATETIME,
    "notes" TEXT,
    "source" TEXT,
    "enrichedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "DailyRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phase" TEXT,
    "prospectsFound" INTEGER NOT NULL DEFAULT 0,
    "invitesSent" INTEGER NOT NULL DEFAULT 0,
    "invitesFailed" INTEGER NOT NULL DEFAULT 0,
    "connectionsChecked" INTEGER NOT NULL DEFAULT 0,
    "newConnections" INTEGER NOT NULL DEFAULT 0,
    "followupsSent" INTEGER NOT NULL DEFAULT 0,
    "newReplies" INTEGER NOT NULL DEFAULT 0,
    "meetingsBooked" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "log" TEXT,
    "errorLog" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "InviteBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InviteBatchItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "draftMessage" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sendResult" TEXT,
    "editedMessage" TEXT,
    "sentAt" DATETIME,
    CONSTRAINT "InviteBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InviteBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExecutionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "contactId" TEXT,
    "request" TEXT,
    "response" TEXT,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "duration" INTEGER,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_linkedinUrl_key" ON "Contact"("linkedinUrl");
