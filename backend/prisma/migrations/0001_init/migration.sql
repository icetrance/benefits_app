-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'APPROVER', 'FINANCE_ADMIN', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RETURNED', 'REJECTED', 'APPROVED', 'PAYMENT_PROCESSING', 'PAID');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT', 'RETURN', 'FINANCE_PROCESS', 'PAID');

-- CreateTable
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "requiresReceipt" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseRequest" (
  "id" TEXT NOT NULL,
  "requestNumber" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL,
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpenseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseLineItem" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL,

  CONSTRAINT "ExpenseLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptAttachment" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReceiptAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAction" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actionType" "ApprovalActionType" NOT NULL,
  "fromStatus" "RequestStatus" NOT NULL,
  "toStatus" "RequestStatus" NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventDataJson" TEXT NOT NULL,
  "prevHash" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseRequest_requestNumber_key" ON "ExpenseRequest"("requestNumber");

-- AddForeignKey
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRequest" ADD CONSTRAINT "ExpenseRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLineItem" ADD CONSTRAINT "ExpenseLineItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ExpenseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptAttachment" ADD CONSTRAINT "ReceiptAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ExpenseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ExpenseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
