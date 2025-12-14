import { useSync } from "@tui/context/sync"
import { createMemo, For, Show, onMount } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "@tui/ui/dialog"
import { TextAttributes } from "@opentui/core"
import { groupBy, entries } from "remeda"

export function DialogPlugins() {
  const sync = useSync()
  const { theme } = useTheme()
  const dialog = useDialog()

  // Set dialog to large size for wider display
  onMount(() => {
    dialog.setSize("large")
  })

  const defaultPlugins = ["opencode-copilot-auth@0.0.9", "opencode-anthropic-auth@0.0.5"]

  const enabledPlugins = createMemo(() => {
    try {
      const config = sync.data.config
      const plugins = config?.plugin || []
      const allPlugins = [...plugins, ...defaultPlugins]
      const uniquePlugins = Array.from(new Set(allPlugins))
      
      const mappedPlugins = uniquePlugins.map((pluginSpec) => {
        // Determine source: global vs project
        let source: "global" | "project" | "system" = "global"
        
        // Handle file:// paths
        if (pluginSpec.startsWith("file://")) {
          const path = pluginSpec.replace("file://", "")
          const pathParts = path.split("/")
          const filename = pathParts[pathParts.length - 1] || path
          const nameWithoutExt = filename.replace(/\.(ts|js|mjs|cjs)$/, "")
          
          // Detect source from path
          const pathStr = path.toLowerCase()
          if (pathStr.includes(".opencode/plugin/") || pathStr.includes("/.opencode/")) {
            source = "project"
          } else if (pathStr.includes(".config/opencode/plugin/") || pathStr.includes("/.config/opencode/")) {
            source = "global"
          } else {
            // Default to project if it's a relative path or contains project indicators
            source = pathStr.includes(".opencode") ? "project" : "global"
          }
          
          return {
            name: nameWithoutExt,
            version: undefined,
            spec: pluginSpec,
            isFile: true,
            path: path,
            source,
            disabled: false,
          }
        }
        
        // Handle npm package format (name@version)
        const atIndex = pluginSpec.lastIndexOf("@")
        const name = atIndex > 0 ? pluginSpec.substring(0, atIndex) : pluginSpec
        const version = atIndex > 0 ? pluginSpec.substring(atIndex + 1) : undefined
        
        // Mark plugins with "disabled" in name as disabled (for testing)
        const disabled = name.includes("disabled") || name.includes("-disabled")
        
        // Default plugins are system, others are global (from config)
        if (defaultPlugins.includes(pluginSpec)) {
          source = "system"
        } else {
          source = "global"
        }
        
        return { name, version, spec: pluginSpec, isFile: false, disabled, source }
      })
      
      // Group by source
      const grouped = groupBy(mappedPlugins, (p) => p.source)
      return entries(grouped).map(([source, plugins]) => ({
        source: source as "global" | "project" | "system",
        plugins,
      }))
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
            {({ source, plugins }) => (
              <box paddingBottom={plugins.length > 0 ? 1.5 : 0}>
                <box paddingBottom={0.5} paddingTop={plugins.length > 0 ? 1 : 0}>
                  <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                    {source === "system" ? "System" : source === "global" ? "Global" : "Project"}
                  </text>
                </box>
                <For each={plugins}>
                  {(plugin) => (
                    <box flexDirection="row" gap={1} alignItems="flex-start" paddingBottom={1} paddingTop={0.5}>
                      <box flexShrink={0} width={2} alignItems="center" justifyContent="flex-start">
                        <text style={{ fg: plugin.disabled ? theme.textMuted : theme.success }} attributes={TextAttributes.BOLD}>
                          {plugin.disabled ? "◯" : "●"}
                        </text>
                      </box>
                      <box flexDirection="column" gap={0.5} flexGrow={1} paddingLeft={0}>
                        <box flexDirection="row" gap={1} alignItems="center" paddingLeft={0}>
                          <text fg={plugin.disabled ? theme.textMuted : theme.text} attributes={TextAttributes.BOLD} paddingLeft={0}>
                            {plugin.name}
                          </text>
                          <Show when={plugin.version}>
                            <text fg={theme.textMuted} paddingLeft={0}>
                              v{plugin.version}
                            </text>
                          </Show>
                          <Show when={source === "project"}>
                            <text fg={theme.accent} paddingLeft={0.5}>
                              <span style={{ fg: theme.accent }}>[project]</span>
                            </text>
                          </Show>
                        </box>
                        <Show when={plugin.isFile && plugin.path}>
                          <text fg={theme.textMuted} paddingLeft={0}>
                            {plugin.path}
                          </text>
                        </Show>
                      </box>
                    </box>
                  )}
                </For>
              </box>
            )}
          </For>
        </Show>
      </box>
    </box>
  )
}
