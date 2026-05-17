import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { AppRuntime } from "../../src/effect/app-runtime"
import { Session } from "../../src/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { Server } from "../../src/server/server"
import { Command } from "../../src/command"
import { MCP } from "../../src/mcp"
import { makeRuntime } from "../../src/effect/run-service"
import { InstanceStore } from "../../src/project/instance-store"
import { WithInstance } from "../../src/project/with-instance"
import { tmpdir } from "../fixture/fixture"
import * as Log from "@opencode-ai/core/util/log"
import { Flag } from "@opencode-ai/core/flag/flag"

Log.init({ print: false })

interface MockClientState {
  tools: Array<{ name: string; description?: string; inputSchema: object }>
  listToolsCalls: number
  listToolsShouldFail: boolean
  listToolsError: string
  connectCalls: number
  listPromptsCalls: number
  listPromptsShouldFail: boolean
  listResourcesCalls: number
  listResourcesShouldFail: boolean
  prompts: Array<{ name: string; description?: string }>
  resources: Array<{ name: string; uri: string; description?: string }>
  closed: boolean
  notificationHandlers: Map<unknown, (...args: any[]) => any>
}

const states = new Map<string, MockClientState>()
let last: string | undefined
let connectFail = false
let connectHang = false
let connectError = "Mock transport cannot connect"
let clientCount = 0
let closeCount = 0

function state(name?: string) {
  const key = name ?? "default"
  let item = states.get(key)
  if (!item) {
    item = {
      tools: [{ name: "test_tool", description: "A test tool", inputSchema: { type: "object", properties: {} } }],
      listToolsCalls: 0,
      listToolsShouldFail: false,
      listToolsError: "listTools failed",
      connectCalls: 0,
      listPromptsCalls: 0,
      listPromptsShouldFail: false,
      listResourcesCalls: 0,
      listResourcesShouldFail: false,
      prompts: [],
      resources: [],
      closed: false,
      notificationHandlers: new Map(),
    }
    states.set(key, item)
  }
  return item
}

class StdioTransport {
  stderr: null = null
  pid = 12345
  constructor(_opts: any) {}
  async start() {
    if (connectHang) return new Promise<void>(() => {})
    if (connectFail) throw new Error(connectError)
  }
  async close() {
    closeCount++
  }
}

class StreamableHTTP {
  constructor(_url: URL, _opts?: any) {}
  async start() {
    if (connectHang) return new Promise<void>(() => {})
    if (connectFail) throw new Error(connectError)
  }
  async close() {
    closeCount++
  }
  async finishAuth() {}
}

class SSE {
  constructor(_url: URL, _opts?: any) {}
  async start() {
    if (connectHang) return new Promise<void>(() => {})
    if (connectFail) throw new Error(connectError)
  }
  async close() {
    closeCount++
  }
}

mock.module("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: StdioTransport,
}))

mock.module("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: StreamableHTTP,
}))

mock.module("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: SSE,
}))

mock.module("@modelcontextprotocol/sdk/client/auth.js", () => ({
  UnauthorizedError: class extends Error {
    constructor() {
      super("Unauthorized")
    }
  },
}))

mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    _state!: MockClientState
    transport: any

    constructor(_opts: any) {
      clientCount++
    }

    async connect(transport: { start: () => Promise<void> }) {
      this.transport = transport
      await transport.start()
      this._state = state(last)
      this._state.connectCalls++
    }

    setNotificationHandler(schema: unknown, handler: (...args: any[]) => any) {
      this._state?.notificationHandlers.set(schema, handler)
    }

    async listTools() {
      if (this._state) {
        this._state.listToolsCalls++
      }
      if (this._state?.listToolsShouldFail) throw new Error(this._state.listToolsError)
      return { tools: this._state?.tools ?? [] }
    }

    async listPrompts() {
      if (this._state) {
        this._state.listPromptsCalls++
      }
      if (this._state?.listPromptsShouldFail) throw new Error("listPrompts failed")
      return { prompts: this._state?.prompts ?? [] }
    }

    async listResources() {
      if (this._state) {
        this._state.listResourcesCalls++
      }
      if (this._state?.listResourcesShouldFail) throw new Error("listResources failed")
      return { resources: this._state?.resources ?? [] }
    }

    async close() {
      if (this._state) this._state.closed = true
    }
  },
}))

beforeEach(() => {
  Flag.OPENCODE_EXPERIMENTAL_HTTPAPI = false
  states.clear()
  last = undefined
  connectFail = false
  connectHang = false
  connectError = "Mock transport cannot connect"
  clientCount = 0
  closeCount = 0
})

afterEach(async () => {
  await AppRuntime.runPromise(InstanceStore.Service.use((store) => store.disposeAll()))
})

async function withInstance(config: Record<string, any>, fn: () => Promise<void>) {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        `${dir}/opencode.json`,
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: config,
          agent: {
            build: {
              model: "openai/gpt-5.2",
            },
          },
        }),
      )
    },
  })

  await WithInstance.provide({
    directory: tmp.path,
    fn,
  })
}

const sessionRuntime = makeRuntime(Session.Service, Session.defaultLayer)
const promptRuntime = makeRuntime(SessionPrompt.Service, SessionPrompt.defaultLayer)

const createSession = () => sessionRuntime.runPromise((session) => session.create({}))

const removeSession = (id: Awaited<ReturnType<typeof createSession>>["id"]) =>
  sessionRuntime.runPromise((session) => session.remove(id))

const runCommand = (input: Parameters<SessionPrompt.Interface["command"]>[0]) =>
  promptRuntime.runPromise((prompt) => prompt.command(input))

const runPrompt = (input: Parameters<SessionPrompt.Interface["prompt"]>[0]) =>
  promptRuntime.runPromise((prompt) => prompt.prompt(input))

describe("session command catalog", () => {
  test("global /command stays base-only and does not connect MCP servers", async () => {
    await withInstance(
      {
        "mcp-commands": {
          type: "local",
          command: ["echo", "commands"],
        },
      },
      async () => {
        last = "mcp-commands"
        const s = state("mcp-commands")
        s.prompts = [{ name: "lazy_prompt", description: "hidden until session load" }]

        const app = Server.Default().app
        const res = await app.request("/command")
        expect(res.status).toBe(200)
        const body = (await res.json()) as Array<{ name: string }>
        const names = body.map((item) => item.name)

        expect(names).toContain("init")
        expect(names).toContain("review")
        expect(names).not.toContain("lazy_prompt")
        expect(clientCount).toBe(0)
        expect(s.connectCalls).toBe(0)
        expect(s.listToolsCalls).toBe(0)
        expect(s.listPromptsCalls).toBe(0)
      },
    )
  })

  test("session-scoped command listing exposes MCP prompts only after explicit session load", async () => {
    await withInstance(
      {
        "mcp-commands": {
          type: "local",
          command: ["echo", "commands"],
        },
      },
      async () => {
        last = "mcp-commands"
        const s = state("mcp-commands")
        s.prompts = [{ name: "lazy_prompt", description: "session only" }]

        const session = await createSession()
        const app = Server.Default().app

        const global = await Command.list()
        expect(global.map((item) => item.name)).not.toContain("lazy_prompt")
        expect(clientCount).toBe(0)
        expect(s.connectCalls).toBe(0)
        expect(s.listToolsCalls).toBe(0)
        expect(s.listPromptsCalls).toBe(0)

        const before = await app.request(`/session/${session.id}/command`)
        expect(before.status).toBe(200)
        expect((await before.json()).map((item: { name: string }) => item.name)).not.toContain("lazy_prompt")

        const load = await app.request(`/session/${session.id}/mcp/mcp-commands`, { method: "POST" })
        expect(load.status).toBe(200)
        await load.json()
        expect(await MCP.active(session.id)).toContain("mcp-commands")

        const scoped = await app.request(`/session/${session.id}/command`)
        expect(scoped.status).toBe(200)
        const names = ((await scoped.json()) as Array<{ name: string }>).map((item) => item.name)

        expect(names).toContain("init")
        expect(names).toContain("review")
        expect(names).toContain("mcp-commands:lazy_prompt")
        expect(clientCount).toBeGreaterThan(0)
        expect(s.connectCalls).toBe(1)
        expect(s.listToolsCalls).toBe(1)
        expect(s.listPromptsCalls).toBe(1)

        const active = await app.request(`/session/${session.id}/mcp`)
        expect(active.status).toBe(200)
        expect((await active.json()) as string[]).toEqual(["mcp-commands"])

        const unload = await app.request(`/session/${session.id}/mcp/mcp-commands`, { method: "DELETE" })
        expect(unload.status).toBe(200)
        expect((await unload.json()).status).toBe("disabled")

        const inactive = await app.request(`/session/${session.id}/mcp`)
        expect(inactive.status).toBe(200)
        expect((await inactive.json()) as string[]).toEqual([])

        const after = await app.request(`/session/${session.id}/command`)
        expect(after.status).toBe(200)
        expect((await after.json()).map((item: { name: string }) => item.name)).not.toContain("lazy_prompt")

        await removeSession(session.id)
      },
    )
  })

  test("session MCP active listing includes servers without prompts", async () => {
    await withInstance(
      {
        "mcp-commands": {
          type: "local",
          command: ["echo", "commands"],
        },
      },
      async () => {
        last = "mcp-commands"
        const s = state("mcp-commands")
        s.prompts = []

        const session = await createSession()
        const app = Server.Default().app

        const load = await app.request(`/session/${session.id}/mcp/mcp-commands`, { method: "POST" })
        expect(load.status).toBe(200)

        const active = await app.request(`/session/${session.id}/mcp`)
        expect(active.status).toBe(200)
        expect((await active.json()) as string[]).toEqual(["mcp-commands"])

        await removeSession(session.id)
      },
    )
  })

  test("session command execution lazily loads the backing MCP", async () => {
    await withInstance(
      {
        "mcp-commands": {
          type: "local",
          command: ["echo", "commands"],
        },
      },
      async () => {
        last = "mcp-commands"
        const s = state("mcp-commands")
        s.prompts = [{ name: "lazy_prompt", description: "session only" }]

        const session = await createSession()

        const msg = await runCommand({
          sessionID: session.id,
          command: "mcp-commands:lazy_prompt",
          arguments: "run now",
        })

        expect(msg.info.role).toBe("assistant")
        expect(await MCP.active(session.id)).toContain("mcp-commands")
        expect(clientCount).toBeGreaterThan(0)
        expect(s.connectCalls).toBe(1)
        expect(s.listToolsCalls).toBe(1)
        expect(s.listPromptsCalls).toBe(1)

        const scoped = await Command.list(session.id)
        expect(scoped.map((item) => item.name)).toContain("mcp-commands:lazy_prompt")

        await removeSession(session.id)
      },
    )
  })

  test("plain session prompt assembly does not connect MCP servers", async () => {
    await withInstance(
      {
        "mcp-commands": {
          type: "local",
          command: ["echo", "commands"],
        },
      },
      async () => {
        last = "mcp-commands"
        const s = state("mcp-commands")
        s.tools = [{ name: "lazy_tool", description: "tool", inputSchema: { type: "object", properties: {} } }]

        const session = await createSession()
        const msg = await runPrompt({
          sessionID: session.id,
          agent: "build",
          noReply: true,
          parts: [{ type: "text", text: "plain prompt" }],
        })

        expect(msg.info.role).toBe("user")
        expect(clientCount).toBe(0)
        expect(s.connectCalls).toBe(0)
        expect(s.listToolsCalls).toBe(0)
        expect(s.listPromptsCalls).toBe(0)

        await removeSession(session.id)
      },
    )
  })
})
