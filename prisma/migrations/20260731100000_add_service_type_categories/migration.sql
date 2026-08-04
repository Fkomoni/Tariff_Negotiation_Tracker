-- Adds three new service type categories requested for the Log
-- Negotiation Request form. Pure additions -- no existing rows reference
-- these values, so this is a straight ALTER TYPE, not a remap like the
-- 20260709233349 migration.
ALTER TYPE "ServiceType" ADD VALUE 'MATERNITY';
ALTER TYPE "ServiceType" ADD VALUE 'GYM_AND_SPA';
ALTER TYPE "ServiceType" ADD VALUE 'IMMUNIZATIONS';
