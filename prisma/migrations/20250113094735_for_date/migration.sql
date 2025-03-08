/*
  Warnings:

  - You are about to drop the column `assignedToDate` on the `Authority` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Authority" DROP COLUMN "assignedToDate";

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "assignedToDate" TIMESTAMP(3),
ADD COLUMN     "forwardedDate" TIMESTAMP(3);
