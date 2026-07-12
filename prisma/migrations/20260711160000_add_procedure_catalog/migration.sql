-- CreateTable
CREATE TABLE "ProcedureCatalogEntry" (
    "procedureId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tariffId" INTEGER,

    CONSTRAINT "ProcedureCatalogEntry_pkey" PRIMARY KEY ("procedureId")
);

-- CreateTable
CREATE TABLE "LookupSync" (
    "key" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "recordCount" INTEGER NOT NULL,

    CONSTRAINT "LookupSync_pkey" PRIMARY KEY ("key")
);
