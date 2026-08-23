-- CreateEnum
CREATE TYPE "ResourceSourceType" AS ENUM ('UPLOAD', 'R2_EXISTING');

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "sourceType" "ResourceSourceType" NOT NULL DEFAULT 'UPLOAD';

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "sourceType" "ResourceSourceType" NOT NULL DEFAULT 'UPLOAD';
