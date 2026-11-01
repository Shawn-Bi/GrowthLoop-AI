-- CreateTable
CREATE TABLE "access_attempt_window" (
    "client_hash" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL,

    CONSTRAINT "access_attempt_window_pkey" PRIMARY KEY ("client_hash","window_start")
);

-- CreateIndex
CREATE INDEX "access_attempt_window_window_start_idx" ON "access_attempt_window"("window_start");

