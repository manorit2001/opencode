import { createContext, Show, useContext, type JSX, type ParentProps } from "solid-js"

export function createSimpleContext<T, Props extends Record<string, any>>(input: {
  name: string
  init: ((input: Props) => T) | (() => T)
}) {
  const ctx = createContext<T>()

  return {
    provider: (props: ParentProps<Props & { gate?: boolean; fallback?: JSX.Element }>) => {
      const init = input.init(props)
      const state = init as { ready?: boolean }
      const gate = props.gate ?? state.ready !== undefined
      return (
        <ctx.Provider value={init}>
          <Show when={!gate || state.ready === undefined || state.ready === true} fallback={props.fallback}>
            {props.children}
          </Show>
        </ctx.Provider>
      )
    },
    use() {
      const value = useContext(ctx)
      if (!value) throw new Error(`${input.name} context must be used within a context provider`)
      return value
    },
  }
}
