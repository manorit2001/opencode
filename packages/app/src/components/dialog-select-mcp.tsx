import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { useParams } from "@solidjs/router"
import { type Command } from "@opencode-ai/sdk/v2"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { Switch } from "@opencode-ai/ui/switch"
import { showToast } from "@opencode-ai/ui/toast"
import { type Component, createEffect, createMemo, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { mcpQueryKey } from "@/context/global-sync"
import { deriveMcpSession } from "@/context/global-sync/mcp-session"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"

const statusLabels = {
  connected: "mcp.status.connected",
  failed: "mcp.status.failed",
  needs_auth: "mcp.status.needs_auth",
  disabled: "mcp.status.disabled",
} as const

export const DialogSelectMcp: Component = () => {
  const sync = useSync()
  const sdk = useSDK()
  const language = useLanguage()
  const queryClient = useQueryClient()
  const params = useParams()
  const [state, setState] = createStore({
    done: false,
    loading: false,
  })

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

  createEffect(
    on(
      () => sync.data.mcp_ready,
      (ready, prev) => {
        if (!ready && prev) setState("done", false)
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    if (state.done || state.loading) return
    if (sync.data.mcp_ready) {
      setState("done", true)
      return
    }

    setState("loading", true)
    void sdk.client.mcp
      .status()
      .then((result) => {
        sync.set("mcp", result.data ?? {})
        sync.set("mcp_ready", true)
        setState("done", true)
      })
      .catch((err) => {
        setState("done", true)
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        setState("loading", false)
      })
  })

  const items = createMemo(() =>
    Object.entries(sync.data.mcp ?? {})
      .map(([name, status]) => ({ name, status: status.status }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )

  const toggle = useMutation(() => ({
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

  const enabledCount = createMemo(() => Object.values(sync.data.mcp_session ?? {}).filter((item) => item.active).length)
  const totalCount = createMemo(() => items().length)

  return (
    <Dialog
      title={language.t("dialog.mcp.title")}
      description={language.t("dialog.mcp.description", { enabled: enabledCount(), total: totalCount() })}
    >
      <List
        search={{ placeholder: language.t("common.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.mcp.empty")}
        key={(x) => x?.name ?? ""}
        items={items}
        filterKeys={["name", "status"]}
        sortBy={(a, b) => a.name.localeCompare(b.name)}
        onSelect={(x) => {
          if (!x || toggle.isPending) return
          toggle.mutate(x.name)
        }}
      >
        {(i) => {
          const transport = () => sync.data.mcp[i.name]
          const status = () => transport()?.status
          const statusLabel = () => {
            const key = status() ? statusLabels[status() as keyof typeof statusLabels] : undefined
            if (!key) return
            return language.t(key)
          }
          const sessionState = () => sync.data.mcp_session[i.name]
          const sessionLabel = () => sessionState()?.status ?? "inactive"
          const error = () => {
            const s = transport()
            if (s?.status === "failed") return s.error
            return sessionState()?.status === "error" ? sessionState()?.error : undefined
          }
          const enabled = () => sessionState()?.active ?? false
          return (
            <div class="w-full flex items-center justify-between gap-x-3">
              <div class="flex flex-col gap-0.5 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="truncate">{i.name}</span>
                  <Show when={statusLabel()}>
                    <span class="text-11-regular text-text-weaker">{statusLabel()}</span>
                  </Show>
                  <Show when={sessionState()}>
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
                </div>
                <Show when={error()}>
                  <span class="text-11-regular text-text-weaker truncate">{error()}</span>
                </Show>
              </div>
              <Switch
                checked={enabled()}
                disabled={toggle.isPending && toggle.variables === i.name}
                onChange={() => {
                  if (toggle.isPending) return
                  toggle.mutate(i.name)
                }}
                onClick={(e: MouseEvent) => e.stopPropagation()}
                onPointerDown={(e: PointerEvent) => e.stopPropagation()}
                onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
              />
            </div>
          )
        }}
      </List>
    </Dialog>
  )
}
