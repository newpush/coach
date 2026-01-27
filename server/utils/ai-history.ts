import { convertToModelMessages } from 'ai'

/**
 * Transforms UI history messages (from Vercel AI SDK frontend) into CoreMessages
 * compatible with Google Generative AI (Gemini).
 *
 * Key Responsibilities:
 * 1. Maps 'assistant' role to 'model'.
 * 2. Merges interleaved tool calls and results.
 * 3. Patches missing 'tool-call' parts in history when only 'tool-approval-request' exists.
 * 4. Ensures no empty content for 'model' messages.
 * 5. Manually extracts tool results if SDK strips them.
 * 6. Sanitizes dangling tool calls.
 */
export async function transformHistoryToCoreMessages(historyMessages: any[]) {
  const coreMessages: any[] = []

  // Map approval IDs to tool call IDs to ensure consistency
  const approvalIdMap = new Map<string, string>()
  for (const m of historyMessages) {
    if (m.role === 'assistant' && Array.isArray(m.parts)) {
      m.parts.forEach((p: any) => {
        if (p.type === 'tool-approval-request' && p.approvalId && p.toolCallId) {
          approvalIdMap.set(p.approvalId, p.toolCallId)
        }
      })
    }
    // Also check metadata fallback
    if (m.role === 'assistant' && m.metadata?.toolApprovals) {
      const approvals = m.metadata.toolApprovals
      if (Array.isArray(approvals)) {
        approvals.forEach((approval: any) => {
          if (approval.approvalId && approval.toolCallId) {
            approvalIdMap.set(approval.approvalId, approval.toolCallId)
          }
        })
      }
    }
  }

  for (const msg of historyMessages) {
    if (msg.role === 'tool') {
      // Handle tool results
      const parts = Array.isArray(msg.content) ? msg.content : msg.parts || []
      const results = parts
        .filter(
          (p: any) =>
            p.type === 'tool-result' ||
            p.type === 'tool-invocation' ||
            p.type === 'tool-approval-response'
        )
        .map((p: any) => {
          const resolvedId = p.toolCallId || approvalIdMap.get(p.approvalId) || p.approvalId
          return {
            type: 'tool-result',
            toolCallId: resolvedId,
            toolName: p.toolName || p.name || 'unknown',
            result: p.result || (p.approved ? 'User confirmed action.' : 'User denied action.')
          }
        })

      if (results.length > 0) {
        coreMessages.push({
          role: 'tool',
          content: results
        })
      }
      continue
    }

    // Use SDK helper
    const converted = await convertToModelMessages([msg])

    // Pre-calculate extracted results for this message (if any)
    const toolResultParts = (msg.parts || []).filter(
      (p: any) => p.type === 'tool-invocation' && p.state === 'result'
    )

    for (const coreMsg of converted) {
      // 1. Fix role mapping (assistant -> model)
      // Note: We keep it as 'assistant' for Vercel AI SDK compatibility,
      // the provider handles the mapping to 'model' internally.

      // 2. Repair & Patch: Fix broken tool calls and inject missing ones
      if (coreMsg.role === 'assistant') {
        // Ensure content is an array
        if (typeof (coreMsg as any).content === 'string') {
          ;(coreMsg as any).content = [{ type: 'text', text: (coreMsg as any).content }]
        } else if (!Array.isArray((coreMsg as any).content)) {
          ;(coreMsg as any).content = []
        }

        const uiParts = (msg.parts || []) as any[]

        // A. Repair: Fix tool calls that SDK converted but assigned generic names
        const coreContent = (coreMsg as any).content as any[]
        coreContent.forEach((part) => {
          if (
            part.type === 'tool-call' &&
            (part.toolName === 'approval-request' || part.toolName === 'invocation')
          ) {
            const originalPart = uiParts.find(
              (p) => p.toolCallId === part.toolCallId || p.approvalId === part.toolCallId
            )
            if (originalPart) {
              part.toolName =
                originalPart.toolCall?.toolName || originalPart.toolName || originalPart.name
              // Ensure args are present
              if (!part.args || Object.keys(part.args).length === 0) {
                part.args =
                  originalPart.toolCall?.args || originalPart.args || originalPart.input || {}
              }
            }
          }
        })

        // B. Patch: Inject tool calls that are completely missing
        const toolParts = uiParts.filter(
          (p: any) => p.type === 'tool-approval-request' || p.type === 'tool-invocation'
        )

        if (toolParts.length > 0) {
          // Look ahead in history to see if this tool call was actually executed/responded to
          const currentMsgIndex = historyMessages.indexOf(msg)
          const subsequentMessages = historyMessages.slice(currentMsgIndex + 1)

          const validToolParts = toolParts.filter((tp: any) => {
            const id = tp.toolCallId || tp.approvalId
            if (!id) return false

            // Check if there is a result for this ID in subsequent messages
            const hasSubsequentResult = subsequentMessages.some(
              (m: any) =>
                m.role === 'tool' &&
                (Array.isArray(m.content) ? m.content : m.parts || []).some(
                  (p: any) => p.toolCallId === id || p.approvalId === id
                )
            )

            // Check if it's an invocation with a result already attached (state='result')
            const isResolvedInvocation = tp.type === 'tool-invocation' && tp.state === 'result'

            return hasSubsequentResult || isResolvedInvocation
          })

          if (validToolParts.length > 0) {
            const existingCalls = coreContent.filter((p) => p.type === 'tool-call')

            validToolParts.forEach((tp: any) => {
              const toolCallId = tp.toolCallId || tp.approvalId
              const toolName = tp.toolCall?.toolName || tp.toolName || tp.name

              // Only add if not already present (checked by ID)
              if (
                toolCallId &&
                toolName &&
                !existingCalls.find((ec) => ec.toolCallId === toolCallId)
              ) {
                coreContent.push({
                  type: 'tool-call',
                  toolCallId,
                  toolName,
                  args: tp.toolCall?.args || tp.args || tp.input || {}
                })
              }
            })
          }
        }

        // C. Sanitize: Remove tool calls that have NO result (Dangling calls)
        const currentMsgIndex = historyMessages.indexOf(msg)
        const subsequentMessages = historyMessages.slice(currentMsgIndex + 1)

        ;(coreMsg as any).content = ((coreMsg as any).content as any[]).filter((part) => {
          if (part.type !== 'tool-call') return true

          const id = part.toolCallId
          // 1. Check for result in subsequent source history messages
          const hasSubsequentResult = subsequentMessages.some(
            (m: any) =>
              m.role === 'tool' &&
              (Array.isArray(m.content) ? m.content : m.parts || []).some(
                (p: any) => p.toolCallId === id || p.approvalId === id
              )
          )
          // 2. Check for result in SAME core message (interleaved)
          const hasSameMessageResult = ((coreMsg as any).content as any[]).some(
            (p) => p.type === 'tool-result' && p.toolCallId === id
          )

          // 3. Check for result in sibling converted messages
          const hasSiblingResult = converted.some(
            (m: any) =>
              m.role === 'tool' &&
              (m.content as any[]).some((p) => p.type === 'tool-result' && p.toolCallId === id)
          )

          // 4. Check for manually extracted results (from tool-invocation parts)
          // These will be appended after this message, so they are valid.
          const hasExtractedResult = toolResultParts.some((p: any) => p.toolCallId === id)

          return (
            hasSubsequentResult || hasSameMessageResult || hasSiblingResult || hasExtractedResult
          )
        })
      }

      // 3. Ensure no empty assistant messages
      if (
        coreMsg.role === 'assistant' &&
        (!(coreMsg as any).content ||
          (Array.isArray((coreMsg as any).content) && (coreMsg as any).content.length === 0))
      ) {
        ;(coreMsg as any).content = [{ type: 'text', text: ' ' }]
      }

      coreMessages.push(coreMsg)

      // Append extracted tool results if needed (and if not already produced by SDK)
      if (toolResultParts.length > 0) {
        const sdkProducedToolMsg = converted.find((m) => m.role === 'tool')

        if (!sdkProducedToolMsg) {
          coreMessages.push({
            role: 'tool',
            content: toolResultParts.map((p: any) => ({
              type: 'tool-result',
              toolCallId: p.toolCallId,
              toolName: p.toolName,
              result: p.result
            }))
          })
        }
      }
    }
  }

  // Final Pass: Remove orphan tool results (Tool messages with no preceding call)
  // Gemini requires that every 'tool' message is preceded by a 'model' message containing the call.
  // We iterate backwards to safely remove.
  const validCoreMessages: any[] = []
  const toolCallIds = new Set<string>()

  // First pass: Collect all valid tool call IDs from assistant messages
  coreMessages.forEach((msg) => {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      msg.content.forEach((p: any) => {
        if (p.type === 'tool-call') {
          toolCallIds.add(p.toolCallId)
        }
      })
    }
  })

  // Second pass: Filter messages
  for (const msg of coreMessages) {
    if (msg.role === 'tool') {
      const content = msg.content as any[]
      // Filter out parts that don't have a matching call
      const validContent = content.filter(
        (p: any) => p.type === 'tool-result' && toolCallIds.has(p.toolCallId)
      )

      if (validContent.length > 0) {
        validCoreMessages.push({ ...msg, content: validContent })
      } else {
        // Drop the message entirely if it has no valid results
        // Alternatively, convert to text? For now, dropping is safer for schema.
      }
    } else {
      validCoreMessages.push(msg)
    }
  }

  return validCoreMessages
}
