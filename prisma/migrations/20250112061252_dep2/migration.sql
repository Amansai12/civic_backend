/*
  Warnings:

  - You are about to drop the column `departmentId` on the `Authority` table. All the data in the column will be lost.
  - The primary key for the `Department` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Department` table. All the data in the column will be lost.
  - You are about to drop the column `departmentId` on the `Issue` table. All the data in the column will be lost.
  - Added the required column `departmentName` to the `Authority` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Authority" DROP CONSTRAINT "Authority_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "Issue" DROP CONSTRAINT "Issue_departmentId_fkey";

-- AlterTable
ALTER TABLE "Authority" DROP COLUMN "departmentId",
ADD COLUMN     "departmentName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Department" DROP CONSTRAINT "Department_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "Department_pkey" PRIMARY KEY ("officeId", "name");

-- AlterTable
ALTER TABLE "Issue" DROP COLUMN "departmentId",
ADD COLUMN     "departmentName" TEXT,
ADD COLUMN     "departmentOfficeId" TEXT;

-- AddForeignKey
ALTER TABLE "Authority" ADD CONSTRAINT "Authority_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authority" ADD CONSTRAINT "Authority_officeId_departmentName_fkey" FOREIGN KEY ("officeId", "departmentName") REFERENCES "Department"("officeId", "name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_departmentOfficeId_departmentName_fkey" FOREIGN KEY ("departmentOfficeId", "departmentName") REFERENCES "Department"("officeId", "name") ON DELETE SET NULL ON UPDATE CASCADE;
