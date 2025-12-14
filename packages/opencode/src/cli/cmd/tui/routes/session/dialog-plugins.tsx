import { useSync } from "@tui/context/sync"
import { createMemo, createSignal, For, Show, onMount } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "@tui/ui/dialog"
import { TextAttributes } from "@opentui/core"
import { groupBy, entries } from "remeda"
import { useSDK } from "@tui/context/sdk"
import { useKeyboard } from "@opentui/solid"
import { Keybind } from "@/util/keybind"

export function DialogPlugins() {
  const sync = useSync()
  const { theme } = useTheme()
  const dialog = useDialog()
  const sdk = useSDK()
  const [loading, setLoading] = createSignal<string | null>(null)
  const [selectedIndex, setSelectedIndex] = createSignal(0)

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

  // Flatten plugins for keyboard navigation
  const flatPlugins = createMemo(() => {
    return enabledPlugins().flatMap(({ source, plugins }) =>
      plugins.map((plugin) => ({ ...plugin, source }))
    )
  })

  const selectedPlugin = createMemo(() => flatPlugins()[selectedIndex()])

  // Toggle plugin enabled/disabled
  const togglePlugin = async (plugin: ReturnType<typeof flatPlugins>[number]) => {
    // Can't toggle system plugins
    if (plugin.source === "system") return
    
    // Can't toggle while loading
    if (loading() !== null) return

    setLoading(plugin.spec)
    try {
      const currentConfig = sync.data.config
      const currentPlugins = currentConfig?.plugin || []
      
      // Check if plugin is currently enabled in config
      const isCurrentlyEnabled = currentPlugins.includes(plugin.spec)
      
      let updatedPlugins: string[]
      if (isCurrentlyEnabled) {
        // Disable: remove from config
        updatedPlugins = currentPlugins.filter((p) => p !== plugin.spec)
      } else {
        // Enable: add to config
        updatedPlugins = [...currentPlugins, plugin.spec]
      }

      // Update config via SDK - merge with existing config
      await sdk.client.config.update({
        plugin: updatedPlugins,
      })

      // Refresh config
      const newConfig = await sdk.client.config.get({})
      if (newConfig.data) {
        sync.set("config", newConfig.data)
      }
    } catch (error) {
      console.error("Failed to toggle plugin:", error)
    } finally {
      setLoading(null)
    }
  }

  // Keyboard navigation and toggle
  useKeyboard((evt) => {
    const plugins = flatPlugins()
    if (plugins.length === 0) return

    if (evt.name === "up" || (evt.ctrl && evt.name === "p")) {
      evt.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : plugins.length - 1))
    }
    if (evt.name === "down" || (evt.ctrl && evt.name === "n")) {
      evt.preventDefault()
      setSelectedIndex((prev) => (prev < plugins.length - 1 ? prev + 1 : 0))
    }
    if (evt.name === "space") {
      evt.preventDefault()
      const plugin = selectedPlugin()
      if (plugin) togglePlugin(plugin)
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} gap={0.5}>
      <box flexDirection="row" justifyContent="space-between" paddingBottom={0.5}>
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Enabled Plugins
        </text>
        <box flexDirection="row" gap={1}>
          <text fg={theme.textMuted}>space: toggle</text>
          <text fg={theme.textMuted}>esc</text>
        </box>
      </box>
      <box>
        <Show when={enabledPlugins().length === 0}>
          <text fg={theme.textMuted}>No plugins enabled</text>
        </Show>
        <Show when={enabledPlugins().length > 0}>
          <For each={enabledPlugins()}>
            {({ source, plugins }) => (
              <box paddingBottom={plugins.length > 0 ? 0.5 : 0}>
                <box paddingBottom={0.25} paddingTop={plugins.length > 0 ? 0.5 : 0}>
                  <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                    {source === "system" ? "System" : source === "global" ? "Global" : "Project"}
                  </text>
                </box>
                <For each={plugins}>
                  {(plugin, pluginIndex) => {
                    const flatIndex = createMemo(() => {
                      let idx = 0
                      for (const group of enabledPlugins()) {
                        if (group.source === source) {
                          const localIndex = group.plugins.findIndex((p) => p.spec === plugin.spec)
                          if (localIndex >= 0) return idx + localIndex
                          idx += group.plugins.length
                          break
                        } else {
                          idx += group.plugins.length
                        }
                      }
                      return idx
                    })
                    const isSelected = createMemo(() => flatIndex() === selectedIndex())
                    const isLoading = createMemo(() => loading() === plugin.spec)
                    const canToggle = createMemo(() => source !== "system")
                    const isEnabled = createMemo(() => {
                      const config = sync.data.config
                      const configPlugins = config?.plugin || []
                      return configPlugins.includes(plugin.spec)
                    })
                    
                    return (
                      <box 
                        flexDirection="row" 
                        gap={1} 
                        alignItems="flex-start" 
                        paddingBottom={0.5} 
                        paddingTop={0.25}
                        backgroundColor={isSelected() ? theme.backgroundPanel : undefined}
                        onMouseUp={() => {
                          if (canToggle()) {
                            setSelectedIndex(flatIndex())
                            togglePlugin({ ...plugin, source })
                          }
                        }}
                      >
                        <box flexShrink={0} width={2} alignItems="center" justifyContent="flex-start">
                          <Show when={isLoading()}>
                            <text style={{ fg: theme.textMuted }}>⋯</text>
                          </Show>
                          <Show when={!isLoading()}>
                            <text style={{ fg: isEnabled() ? theme.success : theme.textMuted }} attributes={TextAttributes.BOLD}>
                              {isEnabled() ? "●" : "◯"}
                            </text>
                          </Show>
                        </box>
                        <box flexDirection="column" gap={0.25} flexGrow={1} paddingLeft={0}>
                          <box flexDirection="row" gap={1} alignItems="center" paddingLeft={0}>
                            <text fg={isEnabled() ? theme.text : theme.textMuted} attributes={TextAttributes.BOLD} paddingLeft={0}>
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
                            <Show when={!canToggle()}>
                              <text fg={theme.textMuted} paddingLeft={0.5}>
                                <span style={{ fg: theme.textMuted }}>[system]</span>
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
                    )
                  }}
                </For>
              </box>
            )}
          </For>
        </Show>
      </box>
    </box>
  )
}
