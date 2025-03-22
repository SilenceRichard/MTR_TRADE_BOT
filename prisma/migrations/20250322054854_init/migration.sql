-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'PENDING', 'ERROR');

-- CreateTable
CREATE TABLE "TokenPair" (
    "id" TEXT NOT NULL,
    "tokenASymbol" TEXT NOT NULL,
    "tokenBSymbol" TEXT NOT NULL,
    "tokenAMint" TEXT NOT NULL,
    "tokenBMint" TEXT NOT NULL,
    "tokenADecimals" INTEGER NOT NULL,
    "tokenBDecimals" INTEGER NOT NULL,

    CONSTRAINT "TokenPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "lowerBinId" INTEGER NOT NULL,
    "upperBinId" INTEGER NOT NULL,
    "initialLiquidityA" TEXT NOT NULL,
    "initialLiquidityB" TEXT NOT NULL,
    "lowerPriceLimit" DOUBLE PRECISION NOT NULL,
    "upperPriceLimit" DOUBLE PRECISION NOT NULL,
    "sellTokenMint" TEXT,
    "sellTokenSymbol" TEXT,
    "sellTokenAmount" TEXT,
    "buyTokenMint" TEXT,
    "buyTokenSymbol" TEXT,
    "expectedBuyAmount" TEXT,
    "actualBuyAmount" TEXT,
    "entryPrice" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "status" "PositionStatus" NOT NULL DEFAULT 'ACTIVE',
    "userWallet" TEXT NOT NULL,
    "chatId" INTEGER,
    "tokenPairId" TEXT NOT NULL,
    "lastStatusId" TEXT,
    "positionNFT" TEXT,
    "fee" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionLastStatus" (
    "id" TEXT NOT NULL,
    "activeBin" INTEGER NOT NULL,
    "currentPrice" DOUBLE PRECISION NOT NULL,
    "binInRange" BOOLEAN NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "currentLowerPrice" DOUBLE PRECISION,
    "currentUpperPrice" DOUBLE PRECISION,
    "liquidityX" TEXT,
    "liquidityY" TEXT,
    "pendingFeesX" TEXT,
    "pendingFeesY" TEXT,
    "totalClaimedFeesX" TEXT,
    "totalClaimedFeesY" TEXT,
    "rewardOne" TEXT,
    "rewardTwo" TEXT,
    "lastUpdatedAt" TEXT,

    CONSTRAINT "PositionLastStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionHistory" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "eventType" TEXT NOT NULL,
    "liquidityA" TEXT,
    "liquidityB" TEXT,
    "valueUSD" DOUBLE PRECISION,
    "priceAtEvent" DOUBLE PRECISION,
    "metadataJson" TEXT,

    CONSTRAINT "PositionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWalletMapping" (
    "chatId" INTEGER NOT NULL,
    "walletAddresses" TEXT NOT NULL,
    "primaryWallet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActive" TIMESTAMP(3),
    "name" TEXT,
    "telegram_username" TEXT,

    CONSTRAINT "UserWalletMapping_pkey" PRIMARY KEY ("chatId")
);

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_tokenPairId_fkey" FOREIGN KEY ("tokenPairId") REFERENCES "TokenPair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_lastStatusId_fkey" FOREIGN KEY ("lastStatusId") REFERENCES "PositionLastStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionHistory" ADD CONSTRAINT "PositionHistory_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
