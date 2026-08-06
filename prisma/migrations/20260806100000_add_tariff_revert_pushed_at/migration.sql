-- Tracks whether the return-to-old-price push for a case's tariffEndDate has
-- actually landed in Prognosis (scheduled at completion, pushed manually, or
-- swept by the revert-due task). Null with a due end date = still needs doing.
ALTER TABLE "NegotiationCase" ADD COLUMN "tariffRevertPushedAt" TIMESTAMP(3);
