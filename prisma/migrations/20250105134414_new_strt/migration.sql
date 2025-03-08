-- CreateEnum
CREATE TYPE "status" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'DISPUTED');

-- CreateTable
CREATE TABLE "Citizen" (
    "name" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "profileImage" TEXT NOT NULL DEFAULT 'https://static.vecteezy.com/system/resources/previews/000/574/512/original/vector-sign-of-user-icon.jpg',
    "OTP" TEXT,
    "OTPExpiresAt" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "reputationPoints" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "Citizen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Authority" (
    "name" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "resetPasswordToken" TEXT,
    "resetPasswordExpiresAt" TIMESTAMP(3),
    "verificationToken" TEXT,
    "verificationTokenExpiresAt" TIMESTAMP(3),
    "officeId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "profileImage" TEXT NOT NULL DEFAULT 'https://static.vecteezy.com/system/resources/previews/000/574/512/original/vector-sign-of-user-icon.jpg',
    "assignedToDate" TIMESTAMP(3),

    CONSTRAINT "Authority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" TEXT NOT NULL,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image" TEXT,
    "userId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "officeId" TEXT NOT NULL,
    "status" "status" NOT NULL DEFAULT 'PENDING',
    "dispute" BOOLEAN NOT NULL DEFAULT false,
    "disputeMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "department" TEXT,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Update" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Update_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_upVoted" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_upVoted_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Citizen_phone_key" ON "Citizen"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Citizen_OTP_key" ON "Citizen"("OTP");

-- CreateIndex
CREATE UNIQUE INDEX "Authority_email_key" ON "Authority"("email");

-- CreateIndex
CREATE INDEX "_upVoted_B_index" ON "_upVoted"("B");

-- AddForeignKey
ALTER TABLE "Authority" ADD CONSTRAINT "Authority_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Citizen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Authority"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Update" ADD CONSTRAINT "Update_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_upVoted" ADD CONSTRAINT "_upVoted_A_fkey" FOREIGN KEY ("A") REFERENCES "Citizen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_upVoted" ADD CONSTRAINT "_upVoted_B_fkey" FOREIGN KEY ("B") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
