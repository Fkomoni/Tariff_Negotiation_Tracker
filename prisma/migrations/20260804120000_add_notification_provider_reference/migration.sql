-- Stores the SMS gateway's ticket id alongside each sent notification. The
-- send response returns one, but it was being discarded, leaving no way to
-- trace a message a member says never arrived (the send endpoint reports
-- gateway acceptance, not handset delivery).
ALTER TABLE "MemberNotification" ADD COLUMN "providerReference" TEXT;
