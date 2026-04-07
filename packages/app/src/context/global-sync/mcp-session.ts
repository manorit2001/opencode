export type McpSession = {
  active: boolean
  status: "active" | "error" | "inactive" | "loading"
  error?: string
}

export function deriveMcpSession(names: string[]) {
  const session: Record<string, McpSession> = {}

  for (const name of names) {
    session[name] = {
      active: true,
      status: "active",
    }
  }

  return session
}
