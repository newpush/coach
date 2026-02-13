-- Pin flash model ID to avoid drift from floating aliases.
ALTER TABLE "LlmAnalysisLevelSettings"
ALTER COLUMN "modelId" SET DEFAULT 'gemini-2.5-flash-preview-09-2025';

UPDATE "LlmAnalysisLevelSettings"
SET "modelId" = 'gemini-2.5-flash-preview-09-2025'
WHERE "modelId" = 'gemini-flash-latest';

UPDATE "LlmOperationOverride"
SET "modelId" = 'gemini-2.5-flash-preview-09-2025'
WHERE "modelId" = 'gemini-flash-latest';
