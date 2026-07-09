-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CONTACT_CENTER', 'PROVIDER_TEAM', 'PENDING');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('MEDICATION', 'DELIVERY', 'SURGERY', 'LAB', 'SCAN', 'ADMISSION', 'PROCEDURE', 'OTHERS');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('ROUTINE', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('NEW_REQUEST', 'UNDER_REVIEW', 'NEGOTIATING', 'AWAITING_PROVIDER_FEEDBACK', 'AWAITING_INTERNAL_APPROVAL', 'COMPLETED', 'DECLINED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "UpdateType" AS ENUM ('STATUS_CHANGE', 'NOTE', 'NOTIFICATION', 'OWNER_CHANGE');

-- CreateEnum
CREATE TYPE "NotificationUrgencyTemplate" AS ENUM ('ROUTINE', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "prognosisUsername" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegotiationCase" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "enrolleeName" TEXT NOT NULL,
    "enrolleeId" TEXT,
    "enrolleeEmail" TEXT,
    "enrolleePhone" TEXT,
    "serviceType" "ServiceType" NOT NULL,
    "requestedItem" TEXT NOT NULL,
    "currentTariff" DECIMAL(14,2) NOT NULL,
    "providerRequestedAmount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "urgency" "Urgency" NOT NULL DEFAULT 'ROUTINE',
    "notes" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'NEW_REQUEST',
    "finalAgreedAmount" DECIMAL(14,2),
    "approvalReason" TEXT,
    "loggedByUserId" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerUserId" TEXT,
    "firstActionAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NegotiationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseUpdate" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "UpdateType" NOT NULL,
    "previousStatus" "CaseStatus",
    "newStatus" "CaseStatus",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberNotification" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "sentByUserId" TEXT NOT NULL,
    "template" "NotificationUrgencyTemplate" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "message" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "recipientPhone" TEXT,
    "status" "NotificationStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_prognosisUsername_key" ON "User"("prognosisUsername");

-- CreateIndex
CREATE UNIQUE INDEX "NegotiationCase_caseNumber_key" ON "NegotiationCase"("caseNumber");

-- CreateIndex
CREATE INDEX "NegotiationCase_status_idx" ON "NegotiationCase"("status");

-- CreateIndex
CREATE INDEX "NegotiationCase_urgency_idx" ON "NegotiationCase"("urgency");

-- CreateIndex
CREATE INDEX "NegotiationCase_providerName_idx" ON "NegotiationCase"("providerName");

-- CreateIndex
CREATE INDEX "NegotiationCase_loggedAt_idx" ON "NegotiationCase"("loggedAt");

-- CreateIndex
CREATE INDEX "CaseUpdate_caseId_idx" ON "CaseUpdate"("caseId");

-- CreateIndex
CREATE INDEX "MemberNotification_caseId_idx" ON "MemberNotification"("caseId");

-- AddForeignKey
ALTER TABLE "NegotiationCase" ADD CONSTRAINT "NegotiationCase_loggedByUserId_fkey" FOREIGN KEY ("loggedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationCase" ADD CONSTRAINT "NegotiationCase_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseUpdate" ADD CONSTRAINT "CaseUpdate_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "NegotiationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseUpdate" ADD CONSTRAINT "CaseUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNotification" ADD CONSTRAINT "MemberNotification_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "NegotiationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberNotification" ADD CONSTRAINT "MemberNotification_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
