import { EOL } from "os"

type Progress = {
  current: number
  total: number
  label: string
}

export function track(input: { tty: boolean }) {
  const width = 36
  const orange = "\x1b[38;5;214m"
  const muted = "\x1b[0;2m"
  const reset = "\x1b[0m"
  let last = -1

  if (input.tty) process.stderr.write("\x1b[?25l")

  const write = (event: Progress) => {
    const percent = Math.floor((event.current / event.total) * 100)
    if (percent === last && event.current !== event.total) return
    last = percent

    if (input.tty) {
      const fill = Math.round((percent / 100) * width)
      const bar = `${"■".repeat(fill)}${"･".repeat(width - fill)}`
      process.stderr.write(
        `\r${orange}${bar} ${percent.toString().padStart(3)}%${reset} ${muted}${event.label.padEnd(12)} ${event.current}/${event.total}${reset}`,
      )
      if (event.current === event.total) process.stderr.write("\n")
      return
    }

    process.stderr.write(`sqlite-migration:${percent}${EOL}`)
  }

  const done = (opts?: { ok?: boolean }) => {
    if (input.tty) {
      process.stderr.write("\x1b[?25h")
      return
    }
    if (opts?.ok === false) return
    process.stderr.write(`sqlite-migration:done${EOL}`)
  }

  return { write, done }
}
