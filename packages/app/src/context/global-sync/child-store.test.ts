import { describe, expect, test } from "bun:test"
import { createRoot, getOwner } from "solid-js"
import { createStore } from "solid-js/store"
import type { State } from "./types"
import { createChildStoreManager } from "./child-store"

const child = () =>
  createStore({
    status: "complete",
    agent: [],
    command_base: [],
    command: [],
    project: "",
    projectMeta: undefined,
    icon: undefined,
    provider_ready: false,
    provider: { all: [], connected: [], default: {} },
    config: {},
    path: { state: "", config: "", worktree: "", directory: "", home: "" },
    session: [],
    sessionTotal: 0,
    session_status: {},
    session_diff: {},
    todo: {},
    permission: {},
    question: {},
    mcp_ready: false,
    mcp: {},
    mcp_session: {},
    lsp_ready: false,
    lsp: [],
    vcs: undefined,
    limit: 5,
    message: {},
    part: {},
  } as State)

describe("createChildStoreManager", () => {
  test("does not evict the active directory during mark", () => {
    const owner = createRoot((dispose) => {
      const current = getOwner()
      dispose()
      return current
    })
    if (!owner) throw new Error("owner required")

    const manager = createChildStoreManager({
      owner,
      isBooting: () => false,
      isLoadingSessions: () => false,
      onBootstrap() {},
      onDispose() {},
      translate: (key) => key,
      getSdk: () => null!,
      global: { provider: null! },
    })

    Array.from({ length: 30 }, (_, index) => `/pinned-${index}`).forEach((directory) => {
      manager.pin(directory)
    })

    const directory = "/active"
    manager.children[directory] = child()
    manager.mark(directory)

    expect(manager.children[directory]).toBeDefined()
  })
})
