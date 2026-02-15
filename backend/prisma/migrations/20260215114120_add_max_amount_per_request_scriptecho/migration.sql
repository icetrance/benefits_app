-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('BENEFIT', 'TRAVEL', 'PROTOCOL');

-- AlterTable
ALTER TABLE "ExpenseCategory" ADD COLUMN     "defaultBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "expenseType" "ExpenseType" NOT NULL DEFAULT 'BENEFIT',
ADD COLUMN     "maxAmountPerRequest" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ExpenseRequest" ADD COLUMN     "expenseType" "ExpenseType" NOT NULL DEFAULT 'BENEFIT',
ADD COLUMN     "invoiceDate" TIMESTAMP(3),
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "supplier" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "managerId" TEXT;

-- CreateTable
CREATE TABLE "BudgetAllocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "allocated" DOUBLE PRECISION NOT NULL,
    "spent" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetAllocation_userId_categoryId_year_key" ON "BudgetAllocation"("userId", "categoryId", "year");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetAllocation" ADD CONSTRAINT "BudgetAllocation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
