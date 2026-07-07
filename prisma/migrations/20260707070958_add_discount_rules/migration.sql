-- CreateTable
CREATE TABLE "DiscountRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "targetType" TEXT NOT NULL DEFAULT 'PRODUCT',
    "targets" TEXT NOT NULL DEFAULT '[]',
    "discountGid" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DiscountTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "valueType" TEXT NOT NULL,
    "value" REAL NOT NULL,
    CONSTRAINT "DiscountTier_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DiscountRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DiscountRule_shop_idx" ON "DiscountRule"("shop");

-- CreateIndex
CREATE INDEX "DiscountTier_ruleId_idx" ON "DiscountTier"("ruleId");
