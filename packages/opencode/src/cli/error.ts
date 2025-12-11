import { ConfigMarkdown } from "@/config/markdown"
import { Config } from "../config/config"
import { MCP } from "../mcp"
import { Provider } from "../provider/provider"
import { UI } from "./ui"

function isLocalProvider(providerID: string, baseURL?: string): boolean {
  if (!baseURL) return false
  return (
    baseURL.includes("127.0.0.1") ||
    baseURL.includes("localhost") ||
    baseURL.startsWith("http://127.0.0.1") ||
    baseURL.startsWith("http://localhost")
  )
}

function getLocalProviderHints(providerID: string, baseURL?: string): string[] {
  const hints: string[] = []

  if (providerID === "lmstudio" || baseURL?.includes("1234")) {
    hints.push("Is LM Studio running?")
    hints.push(`Check if the server is accessible at ${baseURL || "http://127.0.0.1:1234/v1"}`)
    hints.push("Verify the port number in your configuration (default: 1234)")
    hints.push("See: https://lmstudio.ai/docs")
  } else {
    hints.push("Is the local server running?")
    hints.push(`Check if the server is accessible at ${baseURL || "the configured baseURL"}`)
    hints.push("Verify the port number in your configuration")
  }

  return hints
}

function extractBaseURLFromError(error: unknown): string | undefined {
  if (error instanceof Error) {
    const message = error.message
    const urlMatch = message.match(/https?:\/\/[^\s]+/)
    if (urlMatch) return urlMatch[0]
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      const localhostMatch = message.match(/127\.0\.0\.1:\d+|localhost:\d+/)
      if (localhostMatch) return `http://${localhostMatch[0]}`
    }
  }
  return undefined
}

export function FormatError(input: unknown) {
  if (MCP.Failed.isInstance(input))
    return `MCP server "${input.data.name}" failed. Note, opencode does not support MCP authentication yet.`
  if (Provider.ModelNotFoundError.isInstance(input)) {
    const { providerID, modelID, suggestions } = input.data
    return [
      `Model not found: ${providerID}/${modelID}`,
      ...(Array.isArray(suggestions) && suggestions.length ? ["Did you mean: " + suggestions.join(", ")] : []),
      `Try: \`opencode models\` to list available models`,
      `Or check your config (opencode.json) provider/model names`,
    ].join("\n")
  }
  if (Provider.InitError.isInstance(input)) {
    const { providerID, baseURL } = input.data
    const cause = (input as any).cause as Error | undefined
    const extractedBaseURL = baseURL || extractBaseURLFromError(cause)

    const isConnectionError =
      cause?.message?.includes("ECONNREFUSED") ||
      cause?.message?.includes("fetch failed") ||
      cause?.message?.includes("network") ||
      cause?.message?.includes("connection")

    if (isConnectionError && isLocalProvider(providerID, extractedBaseURL)) {
      const hints = getLocalProviderHints(providerID, extractedBaseURL)
      return [
        `Failed to connect to local provider "${providerID}"`,
        "",
        ...hints.map((hint) => `  • ${hint}`),
        "",
        `Original error: ${cause?.message || "Unknown error"}`,
      ].join("\n")
    }

    return `Failed to initialize provider "${providerID}". Check credentials and configuration.`
  }
  if (Config.JsonError.isInstance(input)) {
    return (
      `Config file at ${input.data.path} is not valid JSON(C)` + (input.data.message ? `: ${input.data.message}` : "")
    )
  }
  if (Config.ConfigDirectoryTypoError.isInstance(input)) {
    return `Directory "${input.data.dir}" in ${input.data.path} is not valid. Rename the directory to "${input.data.suggestion}" or remove it. This is a common typo.`
  }
  if (ConfigMarkdown.FrontmatterError.isInstance(input)) {
    return `Failed to parse frontmatter in ${input.data.path}:\n${input.data.message}`
  }
  if (Config.InvalidError.isInstance(input))
    return [
      `Config file at ${input.data.path} is invalid` + (input.data.message ? `: ${input.data.message}` : ""),
      ...(input.data.issues?.map((issue) => "↳ " + issue.message + " " + issue.path.join(".")) ?? []),
    ].join("\n")

  if (UI.CancelledError.isInstance(input)) return ""
}

export function FormatUnknownError(input: unknown): string {
  if (input instanceof Error) {
    return input.stack ?? `${input.name}: ${input.message}`
  }

  if (typeof input === "object" && input !== null) {
    try {
      const json = JSON.stringify(input, null, 2)
      if (json && json !== "{}") return json
    } catch {}
  }

  return String(input)
}
