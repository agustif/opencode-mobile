import { useSync } from "@tui/context/sync"
import { createMemo, For, Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "@tui/ui/dialog"
import { TextAttributes } from "@opentui/core"

export function DialogPlugins() {
  const sync = useSync()
  const { theme } = useTheme()
  const dialog = useDialog()

  const enabledPlugins = createMemo(() => {
    try {
      const config = sync.data.config
      const plugins = config?.plugin || []
      const defaultPlugins = [
        "opencode-copilot-auth@0.0.9",
        "opencode-anthropic-auth@0.0.5",
      ]
      const allPlugins = [...plugins, ...defaultPlugins]
      const uniquePlugins = Array.from(new Set(allPlugins))
      return uniquePlugins.map((pluginSpec) => {
        const atIndex = pluginSpec.lastIndexOf("@")
        const name = atIndex > 0 ? pluginSpec.substring(0, atIndex) : pluginSpec
        const version = atIndex > 0 ? pluginSpec.substring(atIndex + 1) : undefined
        return { name, version }
      })
    } catch {
      return []
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Enabled Plugins
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <box paddingBottom={1}>
        <Show when={enabledPlugins().length === 0}>
          <text fg={theme.textMuted}>No plugins enabled</text>
        </Show>
        <Show when={enabledPlugins().length > 0}>
          <For each={enabledPlugins()}>
            {(plugin) => (
              <box flexDirection="row" gap={1} paddingBottom={1}>
                <text flexShrink={0} style={{ fg: theme.success }}>•</text>
                <text fg={theme.text}>
                  {plugin.name}
                  <Show when={plugin.version}>
                    <span style={{ fg: theme.textMuted }}>@{plugin.version}</span>
                  </Show>
                </text>
              </box>
            )}
          </For>
        </Show>
      </box>
    </box>
  )
}
