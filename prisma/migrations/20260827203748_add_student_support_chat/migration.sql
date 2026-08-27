-- CreateEnum
CREATE TYPE "StudentSupportChatSenderType" AS ENUM ('USER', 'PARENT');

-- CreateTable
CREATE TABLE "StudentSupportChat" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentSupportChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentSupportChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderType" "StudentSupportChatSenderType" NOT NULL,
    "senderUserId" TEXT,
    "parentDisplayName" TEXT,
    "messageType" "TicketMessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "attachmentMimeType" TEXT,
    "attachmentSize" INTEGER,
    "audioDuration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentSupportChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentSupportChatReadState" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "readerKey" TEXT NOT NULL,
    "userId" TEXT,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentSupportChatReadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentSupportChat_groupId_idx" ON "StudentSupportChat"("groupId");

-- CreateIndex
CREATE INDEX "StudentSupportChat_studentId_idx" ON "StudentSupportChat"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSupportChat_groupId_studentId_key" ON "StudentSupportChat"("groupId", "studentId");

-- CreateIndex
CREATE INDEX "StudentSupportChatMessage_chatId_createdAt_idx" ON "StudentSupportChatMessage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentSupportChatMessage_senderUserId_idx" ON "StudentSupportChatMessage"("senderUserId");

-- CreateIndex
CREATE INDEX "StudentSupportChatReadState_userId_lastReadAt_idx" ON "StudentSupportChatReadState"("userId", "lastReadAt");

-- CreateIndex
CREATE INDEX "StudentSupportChatReadState_readerKey_lastReadAt_idx" ON "StudentSupportChatReadState"("readerKey", "lastReadAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSupportChatReadState_chatId_readerKey_key" ON "StudentSupportChatReadState"("chatId", "readerKey");

-- AddForeignKey
ALTER TABLE "StudentSupportChat" ADD CONSTRAINT "StudentSupportChat_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSupportChat" ADD CONSTRAINT "StudentSupportChat_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSupportChatMessage" ADD CONSTRAINT "StudentSupportChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "StudentSupportChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSupportChatMessage" ADD CONSTRAINT "StudentSupportChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSupportChatReadState" ADD CONSTRAINT "StudentSupportChatReadState_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "StudentSupportChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSupportChatReadState" ADD CONSTRAINT "StudentSupportChatReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
