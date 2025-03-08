/*
  Warnings:

  - Added the required column `audio` to the `Issue` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "audio" TEXT NOT NULL;
