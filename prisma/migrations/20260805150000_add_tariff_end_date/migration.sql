-- Optional intended end date for a negotiated tariff, set by Provider Team
-- at completion. Sent to Prognosis as EndDate on the push (currently ignored
-- there - a price stays active until a successor price starts), and shown on
-- the case as the cue to action the change when it falls due.
ALTER TABLE "NegotiationCase" ADD COLUMN "tariffEndDate" TIMESTAMP(3);
