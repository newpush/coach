-- Add full prompt and response fields for complete debugging
ALTER TABLE "LlmUsage" ADD COLUMN "promptFull" TEXT;
ALTER TABLE "LlmUsage" ADD COLUMN "responseFull" TEXT;