-- AlterTable
ALTER TABLE "ApprovalAction"
  ALTER COLUMN "actorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ApprovalAction" DROP CONSTRAINT IF EXISTS "ApprovalAction_actorId_fkey";
ALTER TABLE "ApprovalAction"
  ADD CONSTRAINT "ApprovalAction_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
