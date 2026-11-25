/** Single-call adapter over DSH 0.2.2-rc.5 batch tool execution for unit tests. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ToolExecutionResult, ToolsService } from '@deepseek-ai/dsh-tools'

export async function executeSingleTool(
  tools: ToolsService,
  input: {
    name: string
    callId: string | ToolCallId
    arguments: unknown
    signal: AbortSignal
    agent?: Agent
  },
): Promise<ToolExecutionResult> {
  const id = typeof input.callId === 'string' ? ToolCallId(input.callId) : input.callId
  const args = typeof input.arguments === 'string' ? input.arguments : JSON.stringify(input.arguments ?? {})
  const batch = await tools.execute({
    calls: [{ type: 'tool-call', id, name: input.name, arguments: args }],
    signal: input.signal,
    ...(input.agent === undefined ? {} : { agent: input.agent }),
  })
  const first = batch.results[0]
  if (first === undefined) throw new Error(`tool batch returned no result for ${input.name}`)
  return first.result
}
