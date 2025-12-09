-- AlterTable
ALTER TABLE "scrape_runs" ADD COLUMN     "archiveSnapshot" TEXT,
ADD COLUMN     "baseUrl" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'LIVE';

-- CreateIndex
CREATE INDEX "scrape_runs_kind_source_startedAt_idx" ON "scrape_runs"("kind", "source", "startedAt");
