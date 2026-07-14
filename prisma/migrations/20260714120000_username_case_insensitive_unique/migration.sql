-- Closes the gap that let two case-variant rows for the same real account
-- coexist (e.g. "k-ezeudu@leadway.com" and "K-ezeudu@leadway.com"), which
-- happened in production before this migration: an Admin pre-provisioned
-- the same person twice under different casing, and prognosisUsername's
-- existing @unique constraint only catches exact-string duplicates, not
-- case variants. The app already matches logins case-insensitively, so a
-- case-variant duplicate is a data-integrity bug, not a legitimate second
-- account, every time.
CREATE UNIQUE INDEX "User_prognosisUsername_ci_key" ON "User" (LOWER("prognosisUsername"));
