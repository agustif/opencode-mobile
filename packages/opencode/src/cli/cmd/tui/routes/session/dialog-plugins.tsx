import { useSync } from "@tui/context/sync"
import { createMemo, createSignal, For, Show, onMount } from "solid-js"
import { useTheme, selectedForeground } from "@tui/context/theme"
import { useDialog } from "@tui/ui/dialog"
import { TextAttributes } from "@opentui/core"
import { groupBy, entries } from "remeda"
import { useSDK } from "@tui/context/sdk"
import { useKeyboard } from "@opentui/solid"
import { Keybind } from "@/util/keybind"
import { useKV } from "@tui/context/kv"
import { useToast } from "@tui/ui/toast"

export function DialogPlugins() {
  const sync = useSync()
  const { theme } = useTheme()
  const dialog = useDialog()
  const sdk = useSDK()
  const kv = useKV()
  const toast = useToast()
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
      
      // Get previously seen plugins from KV (to show disabled ones)
      const seenPlugins = kv.get("plugins_seen", []) as string[]
      
      // Merge current plugins, default plugins, and previously seen plugins
      // This ensures disabled plugins still show up
      const allPlugins = [...new Set([...plugins, ...defaultPlugins, ...seenPlugins])]
      const uniquePlugins = Array.from(new Set(allPlugins))
      
      const mappedPlugins = uniquePlugins.map((pluginSpec) => {
        // Determine source: global vs project
        let source: "global" | "project" | "system" = "global"
        const isSystemPlugin = defaultPlugins.includes(pluginSpec)
        
        // Check if enabled: system plugins are always enabled, others check if in config.plugin array
        // Use exact match since config stores resolved URLs
        const isEnabled = isSystemPlugin || plugins.some(p => p === pluginSpec)
        
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
            source: isSystemPlugin ? "system" : source,
            isEnabled,
          }
        }
        
        // Handle npm package format (name@version)
        const atIndex = pluginSpec.lastIndexOf("@")
        const name = atIndex > 0 ? pluginSpec.substring(0, atIndex) : pluginSpec
        const version = atIndex > 0 ? pluginSpec.substring(atIndex + 1) : undefined
        
        // Default plugins are system, others are global (from config)
        if (isSystemPlugin) {
          source = "system"
        } else {
          source = "global"
        }
        
        return { name, version, spec: pluginSpec, isFile: false, isEnabled, source }
      })
      
      // Group by source, but put system last
      const grouped = groupBy(mappedPlugins, (p) => p.source)
      const groupedEntries = entries(grouped)
      // Sort: system last, others first
      const sorted = groupedEntries.sort(([a], [b]) => {
        if (a === "system") return 1
        if (b === "system") return -1
        return 0
      })
      return sorted.map(([source, plugins]) => ({
        source: source as "global" | "project" | "system",
        plugins,
      }))
    } catch {
      return []
    }
  })

  // Flatten plugins for keyboard navigation (exclude system plugins)
  const flatPlugins = createMemo(() => {
    return enabledPlugins()
      .filter(({ source }) => source !== "system")
      .flatMap(({ source, plugins }) =>
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
      const currentDisabled = (currentConfig?.disabled_plugins as string[] | undefined) || []
      
      // Check if plugin is currently enabled (in plugin array and not in disabled_plugins)
      const isCurrentlyEnabled = currentPlugins.includes(plugin.spec) && !currentDisabled.includes(plugin.spec)
      
      let updatedPlugins: string[]
      let updatedDisabled: string[]
      
      if (isCurrentlyEnabled) {
        // Disable: move from plugin array to disabled_plugins array
        updatedPlugins = currentPlugins.filter((p) => p !== plugin.spec)
        // Add to disabled if not already there
        updatedDisabled = currentDisabled.includes(plugin.spec)
          ? currentDisabled
          : [...currentDisabled, plugin.spec]
      } else {
        // Enable: remove from disabled_plugins and ensure in plugin array
        updatedDisabled = currentDisabled.filter((p) => p !== plugin.spec)
        // Add to plugin array if not already there
        updatedPlugins = currentPlugins.includes(plugin.spec)
          ? currentPlugins
          : [...currentPlugins, plugin.spec]
      }

      // Update config via SDK - merge with existing config
      const result = await sdk.client.config.update({
        config: {
          plugin: updatedPlugins,
          disabled_plugins: updatedDisabled,
        },
      })

      // Refresh config from response
      if (result.data) {
        sync.set("config", result.data)
      } else {
        // Fallback: fetch fresh config
        const newConfig = await sdk.client.config.get({})
        if (newConfig.data) {
          sync.set("config", newConfig.data)
        }
      }

      // Show notification that restart is needed
      toast.show({
        message: `Plugin ${isCurrentlyEnabled ? "disabled" : "enabled"}. Restart TUI for changes to take effect.`,
        variant: "info",
        duration: 5000,
      })
    } catch (error) {
      console.error("Failed to toggle plugin:", error)
      toast.show({
        message: "Failed to update plugin configuration",
        variant: "error",
        duration: 3000,
      })
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
                  <box flexDirection="row" gap={1} alignItems="center">
                    <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                      {source === "system" ? "System" : source === "global" ? "Global" : "Project"}
                    </text>
                    <Show when={source === "system"}>
                      <text fg={theme.textMuted}>
                        (cannot be disabled)
                      </text>
                    </Show>
                  </box>
                </box>
                <For each={plugins}>
                  {(plugin, pluginIndex) => {
                    // System plugins are not selectable, so they don't have a flatIndex
                    const flatIndex = createMemo(() => {
                      if (source === "system") return -1 // Not selectable
                      let idx = 0
                      for (const group of enabledPlugins()) {
                        if (group.source === "system") continue // Skip system plugins
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
                    const isSelected = createMemo(() => source !== "system" && flatIndex() === selectedIndex())
                    const isLoading = createMemo(() => loading() === plugin.spec)
                    const canToggle = createMemo(() => source !== "system")
                    // Use the isEnabled from the plugin data (system plugins are always enabled)
                    const pluginEnabled = createMemo(() => plugin.isEnabled)
                    
                    const selectedFg = createMemo(() => selectedForeground(theme))
                    
                    return (
                      <box 
                        flexDirection="row" 
                        gap={1} 
                        alignItems="flex-start" 
                        paddingBottom={0.5} 
                        paddingTop={0.25}
                        backgroundColor={isSelected() ? theme.primary : undefined}
                        paddingLeft={isSelected() ? 1 : 0}
                        paddingRight={isSelected() ? 1 : 0}
                        onMouseUp={() => {
                          if (source !== "system") {
                            setSelectedIndex(flatIndex())
                            if (canToggle()) {
                              togglePlugin({ ...plugin, source })
                            }
                          }
                        }}
                        onMouseOver={() => {
                          if (source !== "system") {
                            setSelectedIndex(flatIndex())
                          }
                        }}
                      >
                        <box flexShrink={0} width={2} alignItems="center" justifyContent="flex-start">
                          <Show when={isLoading()}>
                            <text style={{ fg: isSelected() ? selectedFg() : theme.textMuted }}>⋯</text>
                          </Show>
                          <Show when={!isLoading()}>
                            <text style={{ fg: isSelected() ? selectedFg() : (pluginEnabled() ? theme.success : theme.textMuted) }} attributes={TextAttributes.BOLD}>
                              {pluginEnabled() ? "●" : "◯"}
                            </text>
                          </Show>
                        </box>
                        <box flexDirection="column" gap={0.25} flexGrow={1} paddingLeft={0}>
                          <box flexDirection="row" gap={1} alignItems="center" paddingLeft={0}>
                            <text fg={isSelected() ? selectedFg() : (pluginEnabled() ? theme.text : theme.textMuted)} attributes={isSelected() ? TextAttributes.BOLD : (pluginEnabled() ? TextAttributes.BOLD : undefined)} paddingLeft={0}>
                              {plugin.name}
                            </text>
                            <Show when={plugin.version}>
                              <text fg={isSelected() ? selectedFg() : theme.textMuted} paddingLeft={0}>
                                v{plugin.version}
                              </text>
                            </Show>
                            <Show when={source === "project"}>
                              <text fg={isSelected() ? selectedFg() : theme.accent} paddingLeft={0.5}>
                                <span style={{ fg: isSelected() ? selectedFg() : theme.accent }}>[project]</span>
                              </text>
                            </Show>
                            <Show when={!canToggle()}>
                              <text fg={isSelected() ? selectedFg() : theme.textMuted} paddingLeft={0.5}>
                                <span style={{ fg: isSelected() ? selectedFg() : theme.textMuted }}>[system]</span>
                              </text>
                            </Show>
                          </box>
                          <Show when={plugin.isFile && plugin.path}>
                            <text fg={isSelected() ? selectedFg() : theme.textMuted} paddingLeft={0}>
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
