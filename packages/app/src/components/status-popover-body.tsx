import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Switch } from "@opencode-ai/ui/switch"
import { Tabs } from "@opencode-ai/ui/tabs"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { showToast } from "@opencode-ai/ui/toast"
import { useNavigate, useParams } from "@solidjs/router"
import { type Accessor, createEffect, createMemo, For, type JSXElement, onCleanup, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { type Command } from "@opencode-ai/sdk/v2"
import { ServerHealthIndicator, ServerRow } from "@/components/server/server-row"
import { useLanguage } from "@/context/language"
import { deriveMcpSession } from "@/context/global-sync/mcp-session"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { normalizeServerUrl, ServerConnection, useServer } from "@/context/server"
import { useSync } from "@/context/sync"
import { useCheckServerHealth, type ServerHealth } from "@/utils/server-health"
import { mcpQueryKey } from "@/context/global-sync"

const pollMs = 10_000

const pluginEmptyMessage = (value: string, file: string): JSXElement => {
  const parts = value.split(file)
  if (parts.length === 1) return value
  return (
    <>
      {parts[0]}
      <code class="bg-surface-raised-base px-1.5 py-0.5 rounded-sm text-text-base">{file}</code>
      {parts.slice(1).join(file)}
    </>
  )
}

const listServersByHealth = (
  list: ServerConnection.Any[],
  active: ServerConnection.Key | undefined,
  status: Record<ServerConnection.Key, ServerHealth | undefined>,
) => {
  if (!list.length) return list
  const order = new Map(list.map((url, index) => [url, index] as const))
  const rank = (value?: ServerHealth) => {
    if (value?.healthy === true) return 0
    if (value?.healthy === false) return 2
    return 1
  }

  return list.slice().sort((a, b) => {
    if (ServerConnection.key(a) === active) return -1
    if (ServerConnection.key(b) === active) return 1
    const diff = rank(status[ServerConnection.key(a)]) - rank(status[ServerConnection.key(b)])
    if (diff !== 0) return diff
    return (order.get(a) ?? 0) - (order.get(b) ?? 0)
  })
}

const useServerHealth = (servers: Accessor<ServerConnection.Any[]>, enabled: Accessor<boolean>) => {
  const checkServerHealth = useCheckServerHealth()
  const [status, setStatus] = createStore({} as Record<ServerConnection.Key, ServerHealth | undefined>)

  createEffect(() => {
    if (!enabled()) {
      setStatus(reconcile({}))
      return
    }
    const list = servers()
    let dead = false

    const refresh = async () => {
      const results: Record<string, ServerHealth> = {}
      await Promise.all(
        list.map(async (conn) => {
          results[ServerConnection.key(conn)] = await checkServerHealth(conn.http)
        }),
      )
      if (dead) return
      setStatus(reconcile(results))
    }

    void refresh()
    const id = setInterval(() => void refresh(), pollMs)
    onCleanup(() => {
      dead = true
      clearInterval(id)
    })
  })

  return status
}

const useDefaultServerKey = (
  get: (() => string | Promise<string | null | undefined> | null | undefined) | undefined,
) => {
  const [state, setState] = createStore({
    url: undefined as string | undefined,
    tick: 0,
  })

  createEffect(() => {
    state.tick
    let dead = false
    const result = get?.()
    if (!result) {
      setState("url", undefined)
      onCleanup(() => {
        dead = true
      })
      return
    }

    if (result instanceof Promise) {
      void result.then((next) => {
        if (dead) return
        setState("url", next ? normalizeServerUrl(next) : undefined)
      })
      onCleanup(() => {
        dead = true
      })
      return
    }

    setState("url", normalizeServerUrl(result))
    onCleanup(() => {
      dead = true
    })
  })

  return {
    key: () => {
      const u = state.url
      if (!u) return
      return ServerConnection.key({ type: "http", http: { url: u } })
    },
    refresh: () => setState("tick", (value) => value + 1),
  }
}

const useMcpToggleMutation = () => {
  const sync = useSync()
  const sdk = useSDK()
  const language = useLanguage()
  const queryClient = useQueryClient()
  const params = useParams()

  const client = sdk.client as typeof sdk.client & {
    client: {
      get: (input: {
        url: string
        path: { sessionID: string }
        query?: { directory?: string; workspace?: string }
      }) => Promise<{ data?: string[] }>
      post: (input: {
        url: string
        path: { sessionID: string; name: string }
        query?: { directory?: string; workspace?: string }
      }) => Promise<unknown>
      delete: (input: {
        url: string
        path: { sessionID: string; name: string }
        query?: { directory?: string; workspace?: string }
      }) => Promise<unknown>
    }
    command2: {
      list: (input: { sessionID: string }) => Promise<{ data?: Command[] }>
    }
  }

  const refresh = async (sessionID: string) => {
    const [commands, active, status] = await Promise.allSettled([
      client.command2.list({ sessionID }),
      client.client.get({ url: "/session/{sessionID}/mcp", path: { sessionID } }),
      sdk.client.mcp.status(),
    ])
    if (commands.status === "fulfilled") {
      const list = commands.value.data ?? sync.data.command_base
      sync.set("command", list)
    }
    if (active.status === "fulfilled") {
      const names = (active.value.data ?? []) as string[]
      sync.set("mcp_session", deriveMcpSession(names))
    } else {
      sync.set("mcp_session", {})
    }
    if (status.status === "fulfilled") {
      sync.set("mcp", status.value.data ?? {})
      sync.set("mcp_ready", true)
    }
  }

  return useMutation(() => ({
    mutationFn: async (name: string) => {
      const sessionID = params.id
      if (!sessionID) return

      const current = sync.data.mcp_session[name]
      const active = current?.active ?? false
      sync.set("mcp_session", name, {
        active: !active,
        status: "loading",
      })

      try {
        await (active
          ? client.client.delete({ url: "/session/{sessionID}/mcp/{name}", path: { sessionID, name } })
          : client.client.post({ url: "/session/{sessionID}/mcp/{name}", path: { sessionID, name } }))
        await refresh(sessionID)
      } catch (err) {
        await refresh(sessionID)
        sync.set("mcp_session", name, {
          active,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        })
        throw err
      }
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: mcpQueryKey(sync.directory) }),
    onError: (err) => {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    },
  }))
}

export function StatusPopoverBody(props: { shown: Accessor<boolean> }) {
  const sync = useSync()
  const server = useServer()
  const platform = usePlatform()
  const dialog = useDialog()
  const language = useLanguage()
  const navigate = useNavigate()

  const fail = (err: unknown) => {
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: err instanceof Error ? err.message : String(err),
    })
  }

  createEffect(() => {
    if (!props.shown()) return
  })

  let dialogRun = 0
  let dialogDead = false
  onCleanup(() => {
    dialogDead = true
    dialogRun += 1
  })
  const servers = createMemo(() => {
    const current = server.current
    const list = server.list
    if (!current) return list
    if (list.every((item) => ServerConnection.key(item) !== ServerConnection.key(current))) return [current, ...list]
    return [current, ...list.filter((item) => ServerConnection.key(item) !== ServerConnection.key(current))]
  })
  const health = useServerHealth(servers, props.shown)
  const sortedServers = createMemo(() => listServersByHealth(servers(), server.key, health))
  const toggleMcp = useMcpToggleMutation()
  const defaultServer = useDefaultServerKey(platform.getDefaultServer)
  const mcpNames = createMemo(() => Object.keys(sync.data.mcp ?? {}).sort((a, b) => a.localeCompare(b)))
  const mcpStatus = (name: string) => sync.data.mcp?.[name]?.status
  const mcpActive = createMemo(() => Object.values(sync.data.mcp_session ?? {}).filter((item) => item.active).length)
  const lspItems = createMemo(() => sync.data.lsp ?? [])
  const lspCount = createMemo(() => lspItems().length)
  const plugins = createMemo(() =>
    (sync.data.config.plugin ?? []).map((item) => (typeof item === "string" ? item : item[0])),
  )
  const pluginCount = createMemo(() => plugins().length)
  const pluginEmpty = createMemo(() => pluginEmptyMessage(language.t("dialog.plugins.empty"), "opencode.json"))

  return (
    <div class="flex items-center gap-1 w-[360px] rounded-xl shadow-[var(--shadow-lg-border-base)]">
      <Tabs
        aria-label={language.t("status.popover.ariaLabel")}
        class="tabs bg-background-strong rounded-xl overflow-hidden"
        data-component="tabs"
        data-active="servers"
        defaultValue="servers"
        variant="alt"
      >
        <Tabs.List data-slot="tablist" class="bg-transparent border-b-0 px-4 pt-2 pb-0 gap-4 h-10">
          <Tabs.Trigger value="servers" data-slot="tab" class="text-12-regular">
            {sortedServers().length > 0 ? `${sortedServers().length} ` : ""}
            {language.t("status.popover.tab.servers")}
          </Tabs.Trigger>
          <Tabs.Trigger value="mcp" data-slot="tab" class="text-12-regular">
            {mcpActive() > 0 ? `${mcpActive()} ` : ""}
            {language.t("status.popover.tab.mcp")}
          </Tabs.Trigger>
          <Tabs.Trigger value="lsp" data-slot="tab" class="text-12-regular">
            {lspCount() > 0 ? `${lspCount()} ` : ""}
            {language.t("status.popover.tab.lsp")}
          </Tabs.Trigger>
          <Tabs.Trigger value="plugins" data-slot="tab" class="text-12-regular">
            {pluginCount() > 0 ? `${pluginCount()} ` : ""}
            {language.t("status.popover.tab.plugins")}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="servers">
          <div class="flex flex-col px-2 pb-2">
            <div class="flex flex-col p-3 bg-background-base rounded-sm min-h-14">
              <For each={sortedServers()}>
                {(s) => {
                  const key = ServerConnection.key(s)
                  const blocked = () => health[key]?.healthy === false
                  return (
                    <button
                      type="button"
                      class="flex items-center gap-2 w-full h-8 pl-3 pr-1.5 py-1.5 rounded-md transition-colors text-left"
                      classList={{
                        "hover:bg-surface-raised-base-hover": !blocked(),
                        "cursor-not-allowed": blocked(),
                      }}
                      aria-disabled={blocked()}
                      onClick={() => {
                        if (blocked()) return
                        navigate("/")
                        queueMicrotask(() => server.setActive(key))
                      }}
                    >
                      <ServerHealthIndicator health={health[key]} />
                      <ServerRow
                        conn={s}
                        dimmed={blocked()}
                        status={health[key]}
                        class="flex items-center gap-2 w-full min-w-0"
                        nameClass="text-14-regular text-text-base truncate"
                        versionClass="text-12-regular text-text-weak truncate"
                        badge={
                          <Show when={key === defaultServer.key()}>
                            <span class="text-11-regular text-text-base bg-surface-base px-1.5 py-0.5 rounded-md">
                              {language.t("common.default")}
                            </span>
                          </Show>
                        }
                      >
                        <div class="flex-1" />
                        <Show when={server.current && key === ServerConnection.key(server.current)}>
                          <Icon name="check" size="small" class="text-icon-weak shrink-0" />
                        </Show>
                      </ServerRow>
                    </button>
                  )
                }}
              </For>

              <Button
                variant="secondary"
                class="mt-3 self-start h-8 px-3 py-1.5"
                onClick={() => {
                  const run = ++dialogRun
                  void import("./dialog-select-server").then((x) => {
                    if (dialogDead || dialogRun !== run) return
                    dialog.show(() => <x.DialogSelectServer />, defaultServer.refresh)
                  })
                }}
              >
                {language.t("status.popover.action.manageServers")}
              </Button>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="mcp">
          <div class="flex flex-col px-2 pb-2">
            <div class="flex flex-col p-3 bg-background-base rounded-sm min-h-14">
              <Show
                when={mcpNames().length > 0}
                fallback={
                  <div class="text-14-regular text-text-base text-center my-auto">{language.t("dialog.mcp.empty")}</div>
                }
              >
                <For each={mcpNames()}>
                  {(name) => {
                    const status = () => mcpStatus(name)
                    const session = () => sync.data.mcp_session[name]
                    const sessionLabel = () => session()?.status ?? "inactive"
                    return (
                      <button
                        type="button"
                        class="flex items-center gap-2 w-full h-8 pl-3 pr-2 py-1 rounded-md hover:bg-surface-raised-base-hover transition-colors text-left"
                        onClick={() => {
                          if (toggleMcp.isPending) return
                          toggleMcp.mutate(name)
                        }}
                        disabled={toggleMcp.isPending && toggleMcp.variables === name}
                      >
                        <div
                          classList={{
                            "size-1.5 rounded-full shrink-0": true,
                            "bg-icon-success-base": status() === "connected",
                            "bg-icon-critical-base": status() === "failed",
                            "bg-border-weak-base": status() === "disabled",
                            "bg-icon-warning-base":
                              status() === "needs_auth" || status() === "needs_client_registration",
                          }}
                        />
                        <span class="text-14-regular text-text-base truncate flex-1">{name}</span>
                        <Show when={session()}>
                          <span
                            classList={{
                              "text-11-regular px-1.5 py-0.5 rounded-md": true,
                              "bg-surface-base text-text-subtle": sessionLabel() === "inactive",
                              "bg-surface-base text-text-weak": sessionLabel() === "loading",
                              "bg-surface-base text-icon-success-base": sessionLabel() === "active",
                              "bg-surface-base text-icon-critical-base": sessionLabel() === "error",
                            }}
                          >
                            {sessionLabel()}
                          </span>
                        </Show>
                        <Switch
                          checked={session()?.active ?? false}
                          disabled={toggleMcp.isPending && toggleMcp.variables === name}
                          onChange={() => {
                            if (toggleMcp.isPending) return
                            toggleMcp.mutate(name)
                          }}
                          onClick={(event: MouseEvent) => event.stopPropagation()}
                          onPointerDown={(event: PointerEvent) => event.stopPropagation()}
                          onKeyDown={(event: KeyboardEvent) => event.stopPropagation()}
                        />
                      </button>
                    )
                  }}
                </For>
              </Show>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="lsp">
          <div class="flex flex-col px-2 pb-2">
            <div class="flex flex-col p-3 bg-background-base rounded-sm min-h-14">
              <Show
                when={lspItems().length > 0}
                fallback={
                  <div class="text-14-regular text-text-base text-center my-auto">{language.t("dialog.lsp.empty")}</div>
                }
              >
                <For each={lspItems()}>
                  {(item) => (
                    <div class="flex items-center gap-2 w-full px-2 py-1">
                      <div
                        classList={{
                          "size-1.5 rounded-full shrink-0": true,
                          "bg-icon-success-base": item.status === "connected",
                          "bg-icon-critical-base": item.status === "error",
                        }}
                      />
                      <span class="text-14-regular text-text-base truncate">{item.name || item.id}</span>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="plugins">
          <div class="flex flex-col px-2 pb-2">
            <div class="flex flex-col p-3 bg-background-base rounded-sm min-h-14">
              <Show
                when={plugins().length > 0}
                fallback={<div class="text-14-regular text-text-base text-center my-auto">{pluginEmpty()}</div>}
              >
                <For each={plugins()}>
                  {(plugin) => (
                    <div class="flex items-center gap-2 w-full px-2 py-1">
                      <div class="size-1.5 rounded-full shrink-0 bg-icon-success-base" />
                      <span class="text-14-regular text-text-base truncate">{plugin}</span>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </Tabs.Content>
      </Tabs>
    </div>
  )
}
