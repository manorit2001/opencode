import { describe, expect, test } from "bun:test"
import { deriveMcpSession } from "./mcp-session"

describe("deriveMcpSession", () => {
  test("marks MCP servers active", () => {
    expect(deriveMcpSession(["alpha", "gamma"])).toEqual({
      alpha: { active: true, status: "active" },
      gamma: { active: true, status: "active" },
    })
  })
})
