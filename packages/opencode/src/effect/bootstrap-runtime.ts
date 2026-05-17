import { Layer, ManagedRuntime } from "effect"

import { Plugin } from "@/plugin"
import { LSP } from "@/lsp/lsp"
import { FileWatcher } from "@/file/watcher"
import { Format } from "@/format"
import { ShareNext } from "@/share/share-next"
import { File } from "@/file"
import { Vcs } from "@/project/vcs"
import { Snapshot } from "@/snapshot"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import * as Observability from "@opencode-ai/core/effect/observability"
import { memoMap } from "@opencode-ai/core/effect/memo-map"
import { AppFileSystem } from "@opencode-ai/core/filesystem"

export const BootstrapLayer = Layer.mergeAll(
  Config.defaultLayer,
  Plugin.defaultLayer,
  ShareNext.defaultLayer,
  Format.defaultLayer,
  LSP.defaultLayer,
  File.defaultLayer,
  FileWatcher.defaultLayer,
  Vcs.defaultLayer,
  Snapshot.defaultLayer,
  Bus.defaultLayer,
).pipe(Layer.provide(AppFileSystem.defaultLayer), Layer.provide(Observability.layer))

export const BootstrapRuntime = ManagedRuntime.make(BootstrapLayer, { memoMap })
