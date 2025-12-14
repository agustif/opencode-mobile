import { useSync } from "@tui/context/sync"
import { createMemo, For, Show, onMount } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "@tui/ui/dialog"
import { TextAttributes } from "@opentui/core"

export function DialogPlugins() {
  const sync = useSync()
  const { theme } = useTheme()
  const dialog = useDialog()

  // Set dialog to large size for wider display
  onMount(() => {
    dialog.setSize("large")
  })

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
        return { name, version, spec: pluginSpec }
      })
    } catch {
      return []
    }
  })

  return (
    <box paddingLeft={3} paddingRight={3} paddingTop={1} paddingBottom={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
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
              <box flexDirection="column" gap={0.5} paddingBottom={1.5} paddingTop={0.5}>
                <box flexDirection="row" gap={1} alignItems="center">
                  <text flexShrink={0} style={{ fg: theme.success }}>•</text>
                  <text fg={theme.text} attributes={TextAttributes.BOLD}>
                    {plugin.name}
                  </text>
                  <Show when={plugin.version}>
                    <text fg={theme.textMuted} style={{ fg: theme.textMuted }}>
                      v{plugin.version}
                    </text>
                  </Show>
                </box>
                <box paddingLeft={2}>
                  <text fg={theme.textMuted} style={{ fg: theme.textMuted }}>
                    {plugin.spec}
                  </text>
                </box>
              </box>
            )}
          </For>
        </Show>
      </box>
    </box>
  )
}
