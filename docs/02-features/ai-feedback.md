# AI Feedback Component

The `AiFeedback` component is a standardized UI element designed to capture user feedback on AI-generated content throughout the Coach Watts application. It provides a simple "Thumbs Up" / "Thumbs Down" interface and supports capturing detailed text feedback.

## Purpose

- **Quality Monitoring:** Allows tracking the performance and perceived quality of AI responses (recommendations, analysis, chat messages).
- **User Engagement:** Gives users a way to signal helpful or unhelpful content.
- **System Improvement:** Collects specific feedback text to identify recurring issues with AI prompts or logic.
- **Transparency:** Provides a direct link to the underlying LLM usage record for debugging and cost tracking.

## Usage

Use this component whenever you display AI-generated content that persists in the database and has an associated `LlmUsage` record.

```vue
<template>
  <div>
    <!-- AI Content -->
    <p>{{ aiGeneratedText }}</p>

    <!-- Feedback Component -->
    <div class="mt-2 flex justify-end">
      <AiFeedback
        v-if="llmUsageId"
        :llm-usage-id="llmUsageId"
        :initial-feedback="existingFeedback"
        :initial-feedback-text="existingFeedbackText"
      />
    </div>
  </div>
</template>

<script setup>
  // Imports are auto-handled by Nuxt
</script>
```

## Props

| Prop                  | Type     | Required | Description                                                          |
| --------------------- | -------- | -------- | -------------------------------------------------------------------- |
| `llmUsageId`          | `string` | **Yes**  | The ID of the `LlmUsage` record associated with the AI generation.   |
| `initialFeedback`     | `string` | No       | Existing feedback state (`"THUMBS_UP"`, `"THUMBS_DOWN"`, or `null`). |
| `initialFeedbackText` | `string` | No       | Existing optional text feedback provided by the user.                |

## Behavior

1.  **Thumbs Up:**
    - Immediately sends a `POST` request to `/api/llm/feedback` with `feedback: "THUMBS_UP"`.
    - Updates the local state to show the active (green) icon.

2.  **Thumbs Down:**
    - Sends a `POST` request to `/api/llm/feedback` with `feedback: "THUMBS_DOWN"`.
    - **Opens a Modal:** A modal dialog appears asking the user for optional details ("What went wrong?").
    - **Submitting Text:** The user can enter text and click "Submit", which sends another update to the same endpoint including the `feedbackText`.

3.  **Usage Link:**
    - An icon (`i-heroicons-document-text`) links to `/settings/llm/usage/[id]`, allowing developers or curious users to see the full prompt and response details.

## Integration Checklist

When adding AI features:

1.  **Log Usage:** Ensure the backend process (e.g., Trigger.dev task or API route) logs the operation to the `LlmUsage` table.
2.  **Return ID:** Ensure the API endpoint returning the AI content also returns the `llmUsageId` (and any existing `feedback` status).
3.  **Place Component:** Add `<AiFeedback />` to the UI, typically right-aligned below the AI content.
