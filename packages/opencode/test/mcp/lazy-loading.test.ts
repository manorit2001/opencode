import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { Instance } from "../../src/project/instance"
import { MCP } from "../../src/mcp/index"
import { tmpdir } from "../fixture/fixture"
import { Log } from "../../src/util/log"

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
  states.clear()
  last = undefined
  connectFail = false
  connectHang = false
  connectError = "Mock transport cannot connect"
  clientCount = 0
  closeCount = 0
})

afterEach(async () => {
  await Instance.disposeAll()
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

  await Instance.provide({
    directory: tmp.path,
    fn: fn,
  })
}

describe("MCP lazy reads", () => {
  test("status() does not connect or discover servers", async () => {
    await withInstance(
      {
        "status-server": {
          type: "local",
          command: ["echo", "status"],
        },
      },
      async () => {
        last = "status-server"
        const s = state("status-server")

        const status = await MCP.status()

        expect(status["status-server"]).toBeDefined()
        expect(clientCount).toBe(0)
        expect(s.connectCalls).toBe(0)
        expect(s.listToolsCalls).toBe(0)
        expect(s.listPromptsCalls).toBe(0)
        expect(s.listResourcesCalls).toBe(0)
      },
    )
  })

  test("prompts() does not connect or discover servers", async () => {
    await withInstance(
      {
        "prompt-server": {
          type: "local",
          command: ["echo", "prompt"],
        },
      },
      async () => {
        last = "prompt-server"
        const s = state("prompt-server")
        s.prompts = [{ name: "lazy_prompt", description: "prompt" }]

        const prompts = await MCP.prompts()

        expect(prompts["prompt-server_lazy_prompt"]).toBeUndefined()
        expect(clientCount).toBe(0)
        expect(s.connectCalls).toBe(0)
        expect(s.listToolsCalls).toBe(0)
        expect(s.listPromptsCalls).toBe(0)
      },
    )
  })

  test("resources() does not connect or discover servers", async () => {
    await withInstance(
      {
        "resource-server": {
          type: "local",
          command: ["echo", "resource"],
        },
      },
      async () => {
        last = "resource-server"
        const s = state("resource-server")
        s.resources = [{ name: "lazy_resource", uri: "file:///test.txt", description: "resource" }]

        const resources = await MCP.resources()

        expect(resources["resource-server_lazy_resource"]).toBeUndefined()
        expect(clientCount).toBe(0)
        expect(s.connectCalls).toBe(0)
        expect(s.listToolsCalls).toBe(0)
        expect(s.listResourcesCalls).toBe(0)
      },
    )
  })
})
