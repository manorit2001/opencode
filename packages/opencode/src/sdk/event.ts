import type {
  LspStatus,
  Message,
  Part,
  PermissionRequest,
  PromptAgentAttachment,
  PromptFileAttachment,
  QuestionRequest,
  Session,
  SessionErrorUnknown,
  SessionMessage,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionStatus,
  Todo,
  ToolFileContent,
  ToolTextContent,
} from "@opencode-ai/sdk/v2"
import type { FileDiff } from "@/snapshot"

type ErrorWithLegacyFields = SessionErrorUnknown & {
  name?: string
  data?: {
    message?: string
    [key: string]: unknown
  }
}

type WorkspaceStatus = "connected" | "connecting" | "disconnected" | "error"
type ToolContent = Array<ToolTextContent | ToolFileContent>
type ToolProvider = SessionMessageAssistantTool["provider"]
type AssistantModel = SessionMessageAssistant["model"]
type AssistantTokens = SessionMessageAssistant["tokens"]
type AssistantFinish = SessionMessageAssistant["finish"]
type CompactionReason = Extract<SessionMessage, { type: "compaction" }>["reason"]

export type EventServerInstanceDisposed = {
  type: "server.instance.disposed"
  properties: {
    directory: string
  }
}

export type EventWorkspaceStatus = {
  type: "workspace.status"
  properties: {
    workspaceID: string
    status: WorkspaceStatus
  }
}

export type EventPermissionAsked = {
  type: "permission.asked"
  properties: PermissionRequest
}

export type EventPermissionReplied = {
  type: "permission.replied"
  properties: {
    sessionID: string
    requestID: string
    reply: string
  }
}

export type EventQuestionAsked = {
  type: "question.asked"
  properties: QuestionRequest
}

export type EventQuestionReplied = {
  type: "question.replied"
  properties: {
    sessionID: string
    requestID: string
    answers: Array<string>
  }
}

export type EventQuestionRejected = {
  type: "question.rejected"
  properties: {
    sessionID: string
    requestID: string
  }
}

export type EventTodoUpdated = {
  type: "todo.updated"
  properties: {
    sessionID: string
    todos: Array<Todo>
  }
}

export type EventSessionDiff = {
  type: "session.diff"
  properties: {
    sessionID: string
    diff: Array<FileDiff>
  }
}

export type EventSessionDeleted = {
  type: "session.deleted"
  properties: {
    info: Session
  }
}

export type EventSessionUpdated = {
  type: "session.updated"
  properties: {
    info: Session
  }
}

export type EventSessionStatus = {
  type: "session.status"
  properties: {
    sessionID: string
    status: SessionStatus
  }
}

export type EventSessionError = {
  type: "session.error"
  properties: {
    sessionID?: string
    error?: ErrorWithLegacyFields
  }
}

export type EventMessageUpdated = {
  type: "message.updated"
  properties: {
    info: Message
  }
}

export type EventMessageRemoved = {
  type: "message.removed"
  properties: {
    sessionID: string
    messageID: string
  }
}

export type EventMessagePartUpdated = {
  id: string
  type: "message.part.updated"
  properties: {
    part: Part
    delta?: string
    sessionID?: string
    time?: number
  }
}

export type EventMessagePartDelta = {
  type: "message.part.delta"
  properties: {
    sessionID: string
    messageID: string
    partID: string
    field: string
    delta: string
  }
}

export type EventMessagePartRemoved = {
  type: "message.part.removed"
  properties: {
    messageID: string
    partID: string
  }
}

export type EventLspUpdated = {
  type: "lsp.updated"
  properties: {
    status?: Array<LspStatus>
  }
}

export type EventVcsBranchUpdated = {
  type: "vcs.branch.updated"
  properties: {
    branch: string
  }
}

export type EventInstallationUpdated = {
  type: "installation.updated"
  properties: {
    version: string
  }
}

export type EventInstallationUpdateAvailable = {
  type: "installation.update-available"
  properties: {
    version: string
  }
}

export type EventTuiCommandExecute = {
  type: "tui.command.execute"
  properties: {
    command: string
  }
}

export type EventTuiToastShow = {
  type: "tui.toast.show"
  properties: {
    title?: string
    message: string
    variant: "info" | "success" | "warning" | "error"
    duration: number
  }
}

export type EventTuiSessionSelect = {
  type: "tui.session.select"
  properties: {
    sessionID: string
  }
}

export type EventTuiPromptAppend = {
  type: "tui.prompt.append"
  properties: {
    text: string
  }
}

export type EventSessionNextPrompted = {
  id: string
  type: "session.next.prompted"
  properties: {
    sessionID: string
    prompt: {
      text: string
      files?: Array<PromptFileAttachment>
      agents?: Array<PromptAgentAttachment>
    }
    timestamp: number
  }
}

export type EventSessionNextSynthetic = {
  id: string
  type: "session.next.synthetic"
  properties: {
    sessionID: string
    text: string
    timestamp: number
  }
}

export type EventSessionNextShellStarted = {
  id: string
  type: "session.next.shell.started"
  properties: {
    sessionID: string
    callID: string
    command: string
    timestamp: number
  }
}

export type EventSessionNextShellEnded = {
  type: "session.next.shell.ended"
  properties: {
    sessionID: string
    callID: string
    output: string
    timestamp: number
  }
}

export type EventSessionNextStepStarted = {
  id: string
  type: "session.next.step.started"
  properties: {
    sessionID: string
    agent: string
    model: AssistantModel
    snapshot?: string
    timestamp: number
  }
}

export type EventSessionNextStepEnded = {
  type: "session.next.step.ended"
  properties: {
    sessionID: string
    finish?: AssistantFinish
    cost?: number
    tokens?: AssistantTokens
    snapshot?: string
    timestamp: number
  }
}

export type EventSessionNextStepFailed = {
  type: "session.next.step.failed"
  properties: {
    sessionID: string
    error: SessionErrorUnknown
    timestamp: number
  }
}

export type EventSessionNextTextStarted = {
  type: "session.next.text.started"
  properties: {
    sessionID: string
  }
}

export type EventSessionNextTextDelta = {
  type: "session.next.text.delta"
  properties: {
    sessionID: string
    delta: string
  }
}

export type EventSessionNextTextEnded = {
  type: "session.next.text.ended"
  properties: {
    sessionID: string
    text: string
  }
}

export type EventSessionNextToolInputStarted = {
  type: "session.next.tool.input.started"
  properties: {
    sessionID: string
    callID: string
    name: string
    timestamp: number
  }
}

export type EventSessionNextToolInputDelta = {
  type: "session.next.tool.input.delta"
  properties: {
    sessionID: string
    callID: string
    delta: string
  }
}

export type EventSessionNextToolInputEnded = {
  type: "session.next.tool.input.ended"
  properties: {
    sessionID: string
    callID: string
  }
}

export type EventSessionNextToolCalled = {
  type: "session.next.tool.called"
  properties: {
    sessionID: string
    callID: string
    provider?: ToolProvider
    input: Record<string, unknown>
    timestamp: number
  }
}

export type EventSessionNextToolProgress = {
  type: "session.next.tool.progress"
  properties: {
    sessionID: string
    callID: string
    structured: Record<string, unknown>
    content: ToolContent
  }
}

export type EventSessionNextToolSuccess = {
  type: "session.next.tool.success"
  properties: {
    sessionID: string
    callID: string
    structured: Record<string, unknown>
    content: ToolContent
    provider?: ToolProvider
    timestamp: number
  }
}

export type EventSessionNextToolFailed = {
  type: "session.next.tool.failed"
  properties: {
    sessionID: string
    callID: string
    error: SessionErrorUnknown
    provider?: ToolProvider
    timestamp: number
  }
}

export type EventSessionNextReasoningStarted = {
  type: "session.next.reasoning.started"
  properties: {
    sessionID: string
    reasoningID: string
  }
}

export type EventSessionNextReasoningDelta = {
  type: "session.next.reasoning.delta"
  properties: {
    sessionID: string
    reasoningID: string
    delta: string
  }
}

export type EventSessionNextReasoningEnded = {
  type: "session.next.reasoning.ended"
  properties: {
    sessionID: string
    reasoningID: string
    text: string
  }
}

export type EventSessionNextRetried = {
  type: "session.next.retried"
  properties: {
    sessionID: string
  }
}

export type EventSessionNextCompactionStarted = {
  id: string
  type: "session.next.compaction.started"
  properties: {
    sessionID: string
    reason: CompactionReason
    timestamp: number
  }
}

export type EventSessionNextCompactionDelta = {
  type: "session.next.compaction.delta"
  properties: {
    sessionID: string
    text: string
  }
}

export type EventSessionNextCompactionEnded = {
  type: "session.next.compaction.ended"
  properties: {
    sessionID: string
    text: string
    include?: string
  }
}

export type EventSync = {
  type: "sync"
  syncEvent: {
    type: string
    id: string
    seq: number
    aggregateID: string
    data: unknown
  }
}

export type Event =
  | EventServerInstanceDisposed
  | EventWorkspaceStatus
  | EventPermissionAsked
  | EventPermissionReplied
  | EventQuestionAsked
  | EventQuestionReplied
  | EventQuestionRejected
  | EventTodoUpdated
  | EventSessionDiff
  | EventSessionDeleted
  | EventSessionUpdated
  | EventSessionStatus
  | EventSessionError
  | EventMessageUpdated
  | EventMessageRemoved
  | EventMessagePartUpdated
  | EventMessagePartDelta
  | EventMessagePartRemoved
  | EventLspUpdated
  | EventVcsBranchUpdated
  | EventInstallationUpdated
  | EventInstallationUpdateAvailable
  | EventTuiCommandExecute
  | EventTuiToastShow
  | EventTuiSessionSelect
  | EventTuiPromptAppend
  | EventSessionNextPrompted
  | EventSessionNextSynthetic
  | EventSessionNextShellStarted
  | EventSessionNextShellEnded
  | EventSessionNextStepStarted
  | EventSessionNextStepEnded
  | EventSessionNextStepFailed
  | EventSessionNextTextStarted
  | EventSessionNextTextDelta
  | EventSessionNextTextEnded
  | EventSessionNextToolInputStarted
  | EventSessionNextToolInputDelta
  | EventSessionNextToolInputEnded
  | EventSessionNextToolCalled
  | EventSessionNextToolProgress
  | EventSessionNextToolSuccess
  | EventSessionNextToolFailed
  | EventSessionNextReasoningStarted
  | EventSessionNextReasoningDelta
  | EventSessionNextReasoningEnded
  | EventSessionNextRetried
  | EventSessionNextCompactionStarted
  | EventSessionNextCompactionDelta
  | EventSessionNextCompactionEnded

export type GlobalEvent = {
  directory: string
  project?: string
  workspace?: string
  payload: Event | EventSync
}

export * as SDKEvent from "./event"
