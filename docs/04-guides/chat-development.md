# Chat Development Guide

This guide outlines the strict requirements for working with the AI Chat system, which uses the **Vercel AI SDK v5** and **Google Gemini** models. Adherence to these patterns is critical for stability and preventing sequence validation errors.

## 1. Message Schemas

The system distinguishes between two primary message formats:

### `UIMessage` (Database & Frontend)

- **Role**: Only `user`, `assistant`, or `system`. **Role `tool` is invalid here.**
- **Parts**: Content is always an array of `parts`.
- **Tool Handling**: Tool calls and results must be stored as parts within an `assistant` message.
- **Part Type**: Must use the typed format: `tool-TOOLNAME`.
- **Tool State**:
  - `approval-requested`: For pending tool calls needing user confirmation.
  - `output-available`: For executed tool calls with results.

### `ModelMessage` (Internal LLM logic)

- **Role**: `user`, `assistant`, `tool`, or `system`.
- **Tool Handling**: Uses specific `tool-call` and `tool-result` roles/parts.
- **Conversion**: ALWAYS use `convertToModelMessages(messages, { tools })` to transform `UIMessages` to `ModelMessages`. **Never attempt to build the tool sequence manually.**

## 2. Strict Sequence Rules (Gemini)

Gemini requires a perfect alternation of roles for tool usage:

1. `user`: "Analyze my ride."
2. `assistant` (calls): Contains tool call parts.
3. `tool` (results): Contains tool result parts (mapped from `output-available` parts in history).
4. `assistant` (text): Final response summarizing the data.

### Validation Failures

If this sequence is broken (e.g., Turn N ends with calls, and Turn N+1 starts with a User message), Gemini will throw an `Invalid prompt` error.

**Rule**: Assistant messages with tool calls MUST be followed by tool results before any other role appears.

## 3. Normalization Pipeline

All history sent to the model in `server/api/chat/messages.post.ts` must pass through the normalization pipeline:

1.  **Merge Consecutive Roles**: If a user sends three messages in a row, they must be merged into one single message.
2.  **Flatten Text**: Gemini prefers a single string `content` or a single text part per message. Multiple text parts should be concatenated with `\n\n`.
3.  **Strip Orphaned Calls**: If an `assistant` message contains tool calls but is followed by a `user` message (broken turn), the tool calls MUST be stripped to maintain a valid sequence.
4.  **No Empty Content**: Ensure all messages have at least a single space `' '` if they would otherwise be empty.

## 4. Documentation References

Before modifying chat logic or tools, consult the local documentation in `vercel-ai-docs/`:

- `07-reference/01-ai-sdk-core/30-model-message.mdx`
- `07-reference/01-ai-sdk-core/31-ui-message.mdx`
- `04-ai-sdk-ui/03-chatbot-tool-usage.mdx`
- `08-migration-guides/26-migration-guide-5-0.mdx`

## 5. Tool Implementation

When creating new tools in `server/utils/ai-tools/`:

- Always use the `tool()` helper from `ai`.
- Ensure `execute` functions return JSON-serializable objects.
- If a tool is added/renamed, ensure the icon is updated in `app/components/ChatToolCall.vue`.
