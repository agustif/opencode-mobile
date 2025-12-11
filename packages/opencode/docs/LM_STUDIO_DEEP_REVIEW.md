# LM Studio Support: Deep Review & Improvement Plan

## Executive Summary

LM Studio is currently supported through manual configuration, but lacks:
- Connection validation
- Helpful error messages for local providers
- Dynamic model discovery
- Health monitoring
- Auto-detection capabilities

This review identifies **4 atomic upstream PRs** and **1 optional plugin** to significantly improve the experience.

---

## Current State Analysis

### 1. Configuration Flow

**Current Implementation:**
```typescript
// packages/opencode/src/provider/provider.ts:541-609
// Providers are loaded from config, but no validation occurs
for (const [providerID, provider] of configProviders) {
  const parsed: Info = {
    id: providerID,
    name: provider.name ?? existing?.name ?? providerID,
    // ... no health check, no connection validation
  }
}
```

**Issues:**
- ✅ Configuration is accepted even if LM Studio server is offline
- ✅ No validation until first API call
- ✅ Silent failures until user tries to use the model
- ✅ Generic error messages don't help diagnose local provider issues

**Code Reference:**
- Provider initialization: `packages/opencode/src/provider/provider.ts:487-746`
- SDK creation: `packages/opencode/src/provider/provider.ts:752-835`
- Error handling: `packages/opencode/src/cli/error.ts:19-20`

---

### 2. Error Handling

**Current Error Messages:**

```typescript
// packages/opencode/src/cli/error.ts:19-20
if (Provider.InitError.isInstance(input)) {
  return `Failed to initialize provider "${input.data.providerID}". Check credentials and configuration.`
}
```

**Problems:**
1. **Generic message** - Doesn't distinguish between:
   - Connection refused (server offline)
   - Invalid configuration
   - Network timeout
   - Authentication issues (not applicable for LM Studio)

2. **No context** - Doesn't detect localhost/127.0.0.1 to provide LM Studio-specific hints

3. **No actionable suggestions** - Doesn't suggest:
   - "Is LM Studio running?"
   - "Check if the server is accessible at http://127.0.0.1:1234/v1"
   - "Verify the port in your configuration"

**Code Reference:**
- Error formatting: `packages/opencode/src/cli/error.ts:7-40`
- Provider transform errors: `packages/opencode/src/provider/transform.ts:406-416`
- Message error handling: `packages/opencode/src/session/message-v2.ts:584-641`

---

### 3. Connection & Timeout Handling

**Current Implementation:**
```typescript
// packages/opencode/src/provider/provider.ts:779-799
options["fetch"] = async (input: any, init?: BunFetchRequestInit) => {
  const fetchFn = customFetch ?? fetch
  const opts = init ?? {}
  
  if (options["timeout"] !== undefined && options["timeout"] !== null) {
    const signals: AbortSignal[] = []
    if (opts.signal) signals.push(opts.signal)
    if (options["timeout"] !== false) signals.push(AbortSignal.timeout(options["timeout"]))
    // ...
  }
  // No connection validation before use
}
```

**Issues:**
- ✅ No pre-flight health check
- ✅ Timeout defaults may be too long for local providers (should fail fast)
- ✅ No distinction between local vs remote provider timeouts
- ✅ Connection errors only surface during actual API calls

**Code Reference:**
- Fetch wrapper: `packages/opencode/src/provider/provider.ts:777-799`
- SDK initialization: `packages/opencode/src/provider/provider.ts:752-835`

---

### 4. UI/UX Integration

**Current State:**
- ✅ LM Studio icon exists: `packages/ui/src/components/provider-icons/types.ts:40`
- ✅ No connection status indicator for local providers
- ✅ No health check UI
- ✅ Provider appears in list even if server is offline

**Code Reference:**
- Provider icons: `packages/ui/src/components/provider-icons/types.ts`
- Status display: `packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx:101-136`
- MCP status (similar pattern): `packages/opencode/src/cli/cmd/tui/component/dialog-status.tsx:8-114`

---

### 5. Documentation

**Current Documentation:**
```markdown
# packages/web/src/content/docs/providers.mdx:751-782
### LM Studio
You can configure opencode to use local models through LM Studio.
```

**Gaps:**
- ✅ No troubleshooting section
- ✅ No mention of common issues (server offline, wrong port)
- ✅ No examples of error scenarios
- ✅ No health check documentation

---

## Detailed Improvement Plan

### PR #1: Provider Health Check Infrastructure

**Goal:** Add optional health check support for all providers, especially local ones.

**Changes:**

#### 1.1 Add Health Check Configuration Schema

```typescript
// packages/opencode/src/config/config.ts
// Extend provider config schema
export const ProviderConfig = z.object({
  // ... existing fields
  healthCheck: z.object({
    url: z.string().optional(), // Defaults to baseURL + /models
    timeout: z.number().default(2000), // Fast timeout for local providers
    enabled: z.boolean().default(true),
  }).optional(),
})
```

#### 1.2 Add Health Check Function

```typescript
// packages/opencode/src/provider/provider.ts
async function checkProviderHealth(
  provider: Info,
  options: Record<string, any>
): Promise<{ healthy: boolean; error?: string }> {
  const healthCheck = provider.options?.["healthCheck"]
  if (!healthCheck?.enabled) return { healthy: true }
  
  const url = healthCheck.url ?? `${options.baseURL}/models`
  const timeout = healthCheck.timeout ?? 2000
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    const response = await fetch(url, {
      signal: controller.signal,
      method: "GET",
    })
    
    clearTimeout(timeoutId)
    return { healthy: response.ok }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return { healthy: false, error }
  }
}
```

#### 1.3 Add Health Check Error Type

```typescript
// packages/opencode/src/provider/provider.ts
export const HealthCheckError = NamedError.create(
  "ProviderHealthCheckError",
  z.object({
    providerID: z.string(),
    baseURL: z.string().optional(),
    error: z.string(),
  }),
)
```

#### 1.4 Integrate Health Check (Lazy)

```typescript
// packages/opencode/src/provider/provider.ts
// In getSDK function, before SDK creation:
async function getSDK(model: Model) {
  const s = await state()
  const provider = s.providers[model.providerID]
  const options = { ...provider.options }
  
  // Lazy health check - only for local providers or when explicitly configured
  const isLocal = options.baseURL?.includes("127.0.0.1") || 
                  options.baseURL?.includes("localhost")
  
  if (isLocal || provider.options?.["healthCheck"]?.enabled) {
    const health = await checkProviderHealth(provider, options)
    if (!health.healthy) {
      log.warn("provider health check failed", {
        providerID: model.providerID,
        error: health.error,
      })
      // Don't throw - allow graceful degradation
      // Error will surface during actual API call with better context
    }
  }
  
  // ... rest of getSDK
}
```

**Files to Modify:**
- `packages/opencode/src/provider/provider.ts` (add health check function, integrate)
- `packages/opencode/src/config/config.ts` (extend schema)
- `packages/opencode/src/cli/error.ts` (add error formatting)

**Testing:**
- Health check passes when server is online
- Health check fails gracefully when server is offline
- Health check respects timeout
- Health check doesn't block provider initialization

---

### PR #2: Enhanced Error Messages for Local Providers

**Goal:** Provide actionable, context-aware error messages for local provider failures.

**Changes:**

#### 2.1 Detect Local Providers in Errors

```typescript
// packages/opencode/src/cli/error.ts
function isLocalProvider(providerID: string, baseURL?: string): boolean {
  if (!baseURL) {
    // Try to get from provider if available
    // This requires passing more context
    return false
  }
  return baseURL.includes("127.0.0.1") || 
         baseURL.includes("localhost") ||
         baseURL.startsWith("http://127.0.0.1") ||
         baseURL.startsWith("http://localhost")
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
```

#### 2.2 Enhance InitError Formatting

```typescript
// packages/opencode/src/cli/error.ts
if (Provider.InitError.isInstance(input)) {
  const { providerID } = input.data
  const cause = input.cause as Error | undefined
  const baseURL = extractBaseURL(cause) // Parse from error message/stack
  
  // Detect connection errors
  const isConnectionError = cause?.message?.includes("ECONNREFUSED") ||
                            cause?.message?.includes("fetch failed") ||
                            cause?.message?.includes("network")
  
  if (isConnectionError && isLocalProvider(providerID, baseURL)) {
    const hints = getLocalProviderHints(providerID, baseURL)
    return [
      `Failed to connect to local provider "${providerID}"`,
      "",
      ...hints.map(hint => `  • ${hint}`),
      "",
      `Original error: ${cause?.message || "Unknown error"}`,
    ].join("\n")
  }
  
  // Generic fallback
  return `Failed to initialize provider "${providerID}". Check credentials and configuration.`
}
```

#### 2.3 Enhance API Error Messages

```typescript
// packages/opencode/src/provider/transform.ts
export function error(providerID: string, error: APICallError) {
  let message = error.message
  
  // Detect local provider from baseURL in error context
  const baseURL = extractBaseURLFromError(error)
  if (isLocalProvider(providerID, baseURL)) {
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      const hints = getLocalProviderHints(providerID, baseURL)
      return [
        message,
        "",
        "Local provider connection failed:",
        ...hints.map(hint => `  • ${hint}`),
      ].join("\n")
    }
  }
  
  // Existing provider-specific handling
  if (providerID === "github-copilot" && message.includes("The requested model is not supported")) {
    return message + "\n\nMake sure the model is enabled in your copilot settings: https://github.com/settings/copilot/features"
  }
  
  return message
}
```

**Files to Modify:**
- `packages/opencode/src/cli/error.ts` (enhance FormatError)
- `packages/opencode/src/provider/transform.ts` (enhance error function)
- `packages/opencode/src/provider/provider.ts` (pass more context to errors)

**Testing:**
- Connection refused errors show helpful hints
- Generic errors still work
- Different local providers get appropriate hints
- Error context is preserved

---

### PR #3: Provider Initialization Hook

**Goal:** Enable plugins to enhance provider configuration without core changes.

**Changes:**

#### 3.1 Add Hook Type

```typescript
// packages/plugin/src/index.ts
export interface Hooks {
  // ... existing hooks
  
  /**
   * Called when a provider is being initialized.
   * Allows plugins to modify provider options and discover models.
   */
  "provider.init"?: (
    input: {
      providerID: string
      provider: ProviderContext
      config: Config
    },
    output: {
      options?: Record<string, any>
      models?: Record<string, Partial<Model>>
    },
  ) => Promise<void>
}
```

#### 3.2 Trigger Hook in Provider Initialization

```typescript
// packages/opencode/src/provider/provider.ts
// In state() function, after loading config providers:

for (const [providerID, provider] of configProviders) {
  // ... existing provider parsing ...
  
  // Trigger plugin hooks
  const plugins = await Plugin.list()
  let enhancedOptions = parsed.options
  let enhancedModels = parsed.models
  
  for (const plugin of plugins) {
    if (plugin["provider.init"]) {
      const output: { options?: Record<string, any>; models?: Record<string, Partial<Model>> } = {}
      await plugin["provider.init"](
        {
          providerID,
          provider: {
            source: "config",
            info: parsed as any,
            options: enhancedOptions,
          },
          config: config as any,
        },
        output,
      )
      
      if (output.options) {
        enhancedOptions = mergeDeep(enhancedOptions, output.options)
      }
      
      if (output.models) {
        for (const [modelID, modelConfig] of Object.entries(output.models)) {
          const existing = enhancedModels[modelID]
          enhancedModels[modelID] = {
            ...existing,
            ...modelConfig,
            id: modelID,
            providerID,
          } as Model
        }
      }
    }
  }
  
  parsed.options = enhancedOptions
  parsed.models = enhancedModels
  database[providerID] = parsed
}
```

#### 3.3 Update Plugin System

```typescript
// packages/opencode/src/plugin/index.ts
export async function trigger<
  Name extends Exclude<keyof Required<Hooks>, "auth" | "event" | "tool" | "provider.init">,
  Input = Parameters<Required<Hooks>[Name]>[0],
  Output = Parameters<Required<Hooks>[Name]>[1],
>(name: Name, input: Input, output: Output): Promise<Output> {
  // ... existing implementation
}

// Add separate function for provider.init (different signature)
export async function triggerProviderInit(
  input: Parameters<Required<Hooks>["provider.init"]>[0],
  output: Parameters<Required<Hooks>["provider.init"]>[1],
): Promise<Parameters<Required<Hooks>["provider.init"]>[1]> {
  for (const hook of await state().then((x) => x.hooks)) {
    const fn = hook["provider.init"]
    if (!fn) continue
    await fn(input, output)
  }
  return output
}
```

**Files to Modify:**
- `packages/plugin/src/index.ts` (add hook type)
- `packages/opencode/src/plugin/index.ts` (add trigger function)
- `packages/opencode/src/provider/provider.ts` (call hook)

**Testing:**
- Hook is called for all providers
- Hook can modify options
- Hook can add models
- Hook errors don't break provider initialization
- Multiple plugins can enhance same provider

---

### PR #4: Connection Validation in getSDK

**Goal:** Validate connections before SDK creation, with graceful degradation.

**Changes:**

#### 4.1 Add Connection Test

```typescript
// packages/opencode/src/provider/provider.ts
async function testConnection(
  baseURL: string,
  timeout: number = 2000
): Promise<{ success: boolean; error?: string }> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    const response = await fetch(`${baseURL}/models`, {
      signal: controller.signal,
      method: "GET",
    })
    
    clearTimeout(timeoutId)
    return { success: response.ok }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return { success: false, error }
  }
}
```

#### 4.2 Integrate in getSDK

```typescript
// packages/opencode/src/provider/provider.ts
async function getSDK(model: Model) {
  const s = await state()
  const provider = s.providers[model.providerID]
  const options = { ...provider.options }
  
  // ... existing option setup ...
  
  // Connection validation for local providers
  const baseURL = options["baseURL"] || model.api.url
  const isLocal = baseURL?.includes("127.0.0.1") || baseURL?.includes("localhost")
  
  if (isLocal && !s.connectionTested.has(model.providerID)) {
    const test = await testConnection(baseURL, 2000)
    s.connectionTested.set(model.providerID, test.success)
    
    if (!test.success) {
      log.warn("local provider connection test failed", {
        providerID: model.providerID,
        baseURL,
        error: test.error,
      })
      // Don't throw - allow SDK creation, error will surface during use
      // But mark for better error messages
      options["_connectionFailed"] = true
      options["_connectionError"] = test.error
    }
  }
  
  // ... rest of getSDK
}
```

#### 4.3 Add Connection Test Cache

```typescript
// packages/opencode/src/provider/provider.ts
const state = Instance.state(async () => {
  // ... existing state ...
  
  return {
    models: languages,
    providers,
    sdk,
    modelLoaders,
    connectionTested: new Map<string, boolean>(), // Add this
  }
})
```

**Files to Modify:**
- `packages/opencode/src/provider/provider.ts` (add test, integrate, cache)

**Testing:**
- Connection test runs for local providers
- Test doesn't block SDK creation
- Test results are cached
- Test respects timeout
- Remote providers are not tested (performance)

---

## Plugin: `opencode-lmstudio`

### Architecture

```typescript
// Example plugin implementation
import type { Plugin } from "@opencode-ai/plugin"

const DEFAULT_PORTS = [1234, 8080, 5000]
const DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1"

async function detectLMStudio(): Promise<{ baseURL: string; port: number } | null> {
  const envPort = process.env.LMSTUDIO_PORT
  if (envPort) {
    const port = parseInt(envPort, 10)
    const baseURL = `http://127.0.0.1:${port}/v1`
    if (await testConnection(baseURL)) {
      return { baseURL, port }
    }
  }
  
  for (const port of DEFAULT_PORTS) {
    const baseURL = `http://127.0.0.1:${port}/v1`
    if (await testConnection(baseURL)) {
      return { baseURL, port }
    }
  }
  
  return null
}

async function discoverModels(baseURL: string): Promise<Record<string, any>> {
  try {
    const response = await fetch(`${baseURL}/models`)
    const data = await response.json()
    
    // OpenAI-compatible format
    const models: Record<string, any> = {}
    for (const model of data.data || []) {
      const id = model.id
      models[id] = {
        name: model.id, // or parse from model name
        // ... other model config
      }
    }
    
    return models
  } catch (e) {
    return {}
  }
}

export const LMStudioPlugin: Plugin = async (ctx) => {
  let detected: { baseURL: string; port: number } | null = null
  let discoveredModels: Record<string, any> = {}
  
  // Auto-detect on plugin load
  detected = await detectLMStudio()
  
  return {
    "provider.init": async (input, output) => {
      if (input.providerID === "lmstudio") {
        // Auto-configure if not already configured
        if (!input.provider.options?.baseURL && detected) {
          output.options = {
            ...output.options,
            baseURL: detected.baseURL,
            healthCheck: {
              url: `${detected.baseURL}/models`,
              timeout: 2000,
              enabled: true,
            },
          }
        }
        
        // Discover models if not in config
        if (Object.keys(input.provider.info.models || {}).length === 0) {
          const baseURL = input.provider.options?.baseURL || detected?.baseURL || DEFAULT_BASE_URL
          discoveredModels = await discoverModels(baseURL)
          output.models = discoveredModels
        }
      }
    },
    
    event: async ({ event }) => {
      // Periodic health checks
      if (event.type === "session.start") {
        // Check health in background
      }
    },
  }
}
```

### Features

1. **Auto-detection** - Scans common ports
2. **Model discovery** - Queries `/v1/models` endpoint
3. **Health monitoring** - Periodic checks
4. **Graceful degradation** - Works even if detection fails

---

## Testing Strategy

### Unit Tests

1. Health check function
   - ✅ Returns healthy when server is online
   - ✅ Returns unhealthy when server is offline
   - ✅ Respects timeout
   - ✅ Handles network errors

2. Error message enhancement
   - ✅ Detects local providers
   - ✅ Provides appropriate hints
   - ✅ Preserves original error

3. Provider init hook
   - ✅ Hook is called
   - ✅ Options can be modified
   - ✅ Models can be added
   - ✅ Multiple plugins work together

4. Connection validation
   - ✅ Tests local providers
   - ✅ Doesn't block initialization
   - ✅ Caches results

### Integration Tests

1. End-to-end LM Studio flow
   - ✅ Configure provider
   - ✅ Health check runs
   - ✅ Models are available
   - ✅ Errors are helpful

2. Plugin integration
   - ✅ Plugin auto-detects LM Studio
   - ✅ Plugin discovers models
   - ✅ Plugin enhances provider

### Manual Testing

1. Server offline scenario
   - Configure LM Studio provider
   - Ensure server is offline
   - Verify helpful error message

2. Server online scenario
   - Configure LM Studio provider
   - Ensure server is online
   - Verify models are available

3. Port conflicts
   - Configure wrong port
   - Verify error message suggests correct port

---

## Migration & Backward Compatibility

### Breaking Changes
- ❌ None - all changes are additive

### Deprecations
- ❌ None

### Migration Path
- ✅ Existing configs continue to work
- ✅ New health check is opt-in via config
- ✅ Plugin is optional

---

## Documentation Updates

### Required Updates

1. **Provider Documentation** (`packages/web/src/content/docs/providers.mdx`)
   - Add health check configuration example
   - Add troubleshooting section
   - Add common error scenarios

2. **Plugin Documentation**
   - Document `opencode-lmstudio` plugin
   - Add installation instructions
   - Add configuration examples

3. **Troubleshooting Guide**
   - Add LM Studio specific section
   - Add connection issues
   - Add port configuration

---

## Success Metrics

1. **Error Resolution Time**
   - Users can diagnose connection issues faster
   - Reduced support requests

2. **User Experience**
   - Auto-detection reduces configuration burden
   - Better error messages reduce frustration

3. **Adoption**
   - More users successfully configure LM Studio
   - Plugin adoption rate

---

## Timeline & Priority

### Phase 1: Core Infrastructure (Week 1-2)
- PR #1: Health Check Infrastructure
- PR #2: Enhanced Error Messages
- PR #3: Provider Init Hook
- PR #4: Connection Validation

### Phase 2: Plugin Development (Week 3)
- Create `opencode-lmstudio` plugin
- Implement auto-detection
- Implement model discovery
- Add health monitoring

### Phase 3: Documentation & Testing (Week 4)
- Update documentation
- Add tests
- Manual testing
- Release

---

## Open Questions

1. **Health Check Frequency**
   - Should health checks be periodic or one-time?
   - Recommendation: One-time on initialization, periodic via plugin

2. **Connection Test Timeout**
   - What's the optimal timeout for local providers?
   - Recommendation: 2000ms (fast fail)

3. **Model Discovery Caching**
   - How long should discovered models be cached?
   - Recommendation: Per-session, refresh on plugin reload

4. **Auto-enable Plugin**
   - Should `opencode-lmstudio` be auto-enabled?
   - Recommendation: No, keep it optional

---

## Conclusion

This plan provides:
- ✅ **4 atomic upstream PRs** that improve all local providers
- ✅ **1 optional plugin** for LM Studio-specific enhancements
- ✅ **Better error messages** for faster troubleshooting
- ✅ **Health check infrastructure** for reliability
- ✅ **Plugin hooks** for extensibility

All changes are **backward compatible** and **opt-in**, ensuring no disruption to existing users.

