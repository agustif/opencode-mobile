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
      const mappedPlugins = uniquePlugins.map((pluginSpec) => {
        // Handle file:// paths
        if (pluginSpec.startsWith("file://")) {
          const path = pluginSpec.replace("file://", "")
          const pathParts = path.split("/")
          const filename = pathParts[pathParts.length - 1] || path
          const nameWithoutExt = filename.replace(/\.(ts|js|mjs|cjs)$/, "")
          // Extract directory name for context (e.g., "plugin" from .../plugin/filename.ts)
          const dirName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : ""
          return {
            name: nameWithoutExt,
            version: undefined,
            spec: pluginSpec,
            isFile: true,
            path: path,
            dirName: dirName,
            disabled: false,
          }
        }
        // Handle npm package format (name@version)
        const atIndex = pluginSpec.lastIndexOf("@")
        const name = atIndex > 0 ? pluginSpec.substring(0, atIndex) : pluginSpec
        const version = atIndex > 0 ? pluginSpec.substring(atIndex + 1) : undefined
        return { name, version, spec: pluginSpec, isFile: false, disabled: false }
      })
      // Add a dummy disabled plugin for testing
      return [
        ...mappedPlugins,
        {
          name: "opencode-example-disabled",
          version: "0.0.1",
          spec: "opencode-example-disabled@0.0.1",
          isFile: false,
          disabled: true,
          path: undefined,
        },
      ]
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
              <box flexDirection="row" gap={1} alignItems="flex-start" paddingBottom={1} paddingTop={0.5}>
                <text flexShrink={0} style={{ fg: plugin.disabled ? theme.textMuted : theme.success }} attributes={TextAttributes.BOLD}>
                  {plugin.disabled ? "○" : "●"}
                </text>
                <box flexDirection="column" gap={0.5} flexGrow={1}>
                  <box flexDirection="row" gap={1} alignItems="center">
                    <text fg={plugin.disabled ? theme.textMuted : theme.text} attributes={TextAttributes.BOLD}>
                      {plugin.name}
                    </text>
                    <Show when={plugin.version}>
                      <text fg={theme.textMuted}>
                        v{plugin.version}
                      </text>
                    </Show>
                  </box>
                  <Show when={plugin.isFile && plugin.path}>
                    <text fg={theme.textMuted} style={{ fg: theme.textMuted }}>
                      {plugin.path}
                    </text>
                  </Show>
                </box>
              </box>
            )}
          </For>
        </Show>
      </box>
    </box>
  )
}
