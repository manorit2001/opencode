import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { useExit } from "../context/exit"
import { useTheme } from "../context/theme"

export function StartupLoading(props: {
  active: () => boolean
  text: () => string
  title?: () => string
  done?: () => number
  total?: () => number
  mode?: "screen" | "banner"
  delay?: number
}) {
  const theme = useTheme().theme
  const dims = useTerminalDimensions()
  const exit = useExit()
  const [show, setShow] = createSignal(false)
  const [frame, setFrame] = createSignal(0)
  let wait: NodeJS.Timeout | undefined
  let tick: NodeJS.Timeout | undefined
  const mode = () => props.mode ?? "banner"
  const total = createMemo(() => props.total?.() ?? 0)
  const done = createMemo(() => props.done?.() ?? 0)
  const width = createMemo(() => {
    if (mode() === "screen") return Math.max(18, Math.min(40, dims().width - 12))
    return 20
  })
  const ratio = createMemo(() => {
    if (total() <= 0) return
    return Math.max(0, Math.min(1, done() / total()))
  })
  const bars = createMemo(() => {
    const size = width()
    const value = ratio()
    if (value !== undefined) {
      const fill = Math.round(size * value)
      return {
        fill: "█".repeat(fill),
        idle: "█".repeat(Math.max(0, size - fill)),
      }
    }

    const span = Math.min(6, Math.max(3, Math.floor(size / 4)))
    const count = Math.max(1, size - span + 1)
    const start = count === 1 ? 0 : frame() % count
    return {
      fill: "█".repeat(span),
      left: start,
      span,
    }
  })
  const left = createMemo(() => {
    if (ratio() !== undefined) return 0
    return bars().left ?? 0
  })
  const right = createMemo(() => {
    if (ratio() !== undefined) return 0
    return Math.max(0, width() - left() - (bars().span ?? 0))
  })
  const percent = createMemo(() => {
    const value = ratio()
    if (value === undefined) return
    return `${Math.round(value * 100)}%`
  })

  createEffect(() => {
    if (props.active()) {
      if (show()) return
      if (wait) return
      const ms = props.delay ?? (mode() === "screen" ? 0 : 150)
      wait = setTimeout(() => {
        wait = undefined
        setShow(true)
      }, ms).unref()
      return
    }

    if (wait) clearTimeout(wait)
    wait = undefined
    if (!show()) return
    setShow(false)
  })

  createEffect(() => {
    if (!show()) {
      if (tick) clearInterval(tick)
      tick = undefined
      return
    }
    if (ratio() !== undefined) return
    if (tick) return
    tick = setInterval(() => setFrame((value) => value + 1), 90).unref()
  })

  useKeyboard((evt) => {
    if (mode() !== "screen" || !show()) return
    if (evt.name === "escape" || evt.name === "q" || (evt.ctrl && evt.name === "c")) {
      evt.preventDefault()
      evt.stopPropagation()
      void exit()
    }
  })

  onCleanup(() => {
    if (wait) clearTimeout(wait)
    if (tick) clearInterval(tick)
  })

  return (
    <Show when={show()}>
      <box
        position={mode() === "screen" ? "relative" : "absolute"}
        zIndex={5000}
        left={0}
        right={0}
        top={mode() === "screen" ? 0 : undefined}
        bottom={mode() === "screen" ? 0 : 1}
        width={mode() === "screen" ? dims().width : undefined}
        height={mode() === "screen" ? dims().height : undefined}
        justifyContent="center"
        alignItems="center"
      >
        <box
          flexDirection="column"
          gap={1}
          minWidth={Math.min(width() + 10, Math.max(28, dims().width - 8))}
          maxWidth={Math.max(28, dims().width - 8)}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={mode() === "screen" ? 1 : 0}
          paddingBottom={mode() === "screen" ? 1 : 0}
          backgroundColor={theme.backgroundPanel}
        >
          <Show when={props.title}>
            <text fg={theme.text}>
              <span style={{ bold: true }}>{props.title?.()}</span>
            </text>
          </Show>
          <text fg={theme.textMuted}>{props.text()}</text>
          <box flexDirection="row" gap={1}>
            <Show when={ratio() !== undefined} fallback={<text fg={theme.border}>{"█".repeat(left())}</text>}>
              <text fg={theme.primary}>{bars().fill}</text>
            </Show>
            <Show when={ratio() === undefined}>
              <text fg={theme.primary}>{bars().fill}</text>
              <text fg={theme.border}>{"█".repeat(right())}</text>
            </Show>
            <Show when={ratio() !== undefined}>
              <text fg={theme.border}>{bars().idle}</text>
            </Show>
          </box>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={theme.textMuted}>
              <Show when={total() > 0} fallback={"Working..."}>
                {done()} / {total()}
              </Show>
            </text>
            <Show when={percent()}>
              <text fg={theme.textMuted}>{percent()}</text>
            </Show>
          </box>
          <Show when={mode() === "screen"}>
            <text fg={theme.textMuted}>Press Esc, q, or Ctrl+C to exit</text>
          </Show>
        </box>
      </box>
    </Show>
  )
}
