-- Data fix: an empty "Final Agreed Amount" form field was coerced to 0 and
-- stored on any status save, so cases still being negotiated carried a
-- "₦0.00 agreed" nobody entered. Null those out. Completed cases are left
-- untouched (completion has always required a real amount, so a completed
-- 0 shouldn't exist - and if one somehow does, hiding it silently would be
-- worse than seeing it).
UPDATE "NegotiationCase"
SET "finalAgreedAmount" = NULL
WHERE "finalAgreedAmount" = 0
  AND "status"::text <> 'COMPLETED';
