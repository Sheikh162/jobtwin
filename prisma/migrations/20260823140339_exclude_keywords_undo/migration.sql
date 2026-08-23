-- AlterTable
ALTER TABLE "SearchCriteria" ADD COLUMN     "excludeKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "previousState" JSONB;
