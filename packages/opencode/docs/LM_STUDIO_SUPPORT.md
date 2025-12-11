# LM Studio Support in OpenCode

## Current State

LM Studio is currently supported in OpenCode through manual configuration. Users must:

1. Manually configure `opencode.json` with:
   - Custom provider ID (e.g., `lmstudio`)
   - Base URL: `http://127.0.0.1:1234/v1`
   - Manual model configuration
   - Use `@ai-sdk/openai-compatible` package

2. **Limitations:**
   - No automatic detection of LM Studio server
   - No dynamic model discovery
   - No health checks or connection validation
   - No default configuration
   - Manual port configuration (defaults to 1234)
   - No error handling for offline/unavailable server
   - No UI integration for local providers

---

## Architecture Decision: Upstream vs Plugin

### Criteria for Upstream Patches

**Should go upstream if:**
- ✅ Core infrastructure that benefits all providers (not just LM Studio)
- ✅ Improves error handling/UX for all users
- ✅ Enables plugins to work better (foundational hooks)
- ✅ Non-opinionated, universally useful features
- ✅ Minimal dependencies, no external API calls
- ✅ Follows existing patterns in the codebase

**Should be a plugin if:**
- ❌ Opinionated/optional features not everyone needs
- ❌ Provider-specific enhancements
- ❌ Requires external API calls or network requests
- ❌ Auto-discovery/auto-configuration features
- ❌ Advanced features with additional dependencies
- ❌ Features that might fail or be unavailable

---

## Upstream Patches (Atomic PRs)

### PR #1: Provider Health Check Infrastructure
**Why upstream:** Core infrastructure that benefits all providers, especially local ones.

**Changes:**
- Add optional `healthCheck` function to provider configuration
- Add `Provider.HealthCheckError` for health check failures
- Validate provider availability before first use (lazy validation)
- Improve `InitError` messages to distinguish connection vs config errors

**Files:**
- `packages/opencode/src/provider/provider.ts`
- `packages/opencode/src/cli/error.ts`

**Example:**
```typescript
// In provider config
{
  "lmstudio": {
    "healthCheck": {
      "url": "http://127.0.0.1:1234/v1/models",
      "timeout": 2000
    }
  }
}
```

---

### PR #2: Enhanced Error Messages for Local Providers
**Why upstream:** Improves UX for all local provider users.

**Changes:**
- Detect localhost/127.0.0.1 baseURLs in error messages
- Provide helpful suggestions when local providers fail:
  - "Is LM Studio running?"
  - "Check if the server is accessible at {baseURL}"
  - "Verify the port number in your configuration"
- Add connection timeout hints for local providers

**Files:**
- `packages/opencode/src/cli/error.ts`
- `packages/opencode/src/provider/provider.ts` (error formatting)

---

### PR #3: Provider Initialization Hook
**Why upstream:** Enables plugins to enhance provider configuration without core changes.

**Changes:**
- Add `provider.init` hook to plugin system
- Allow plugins to modify provider options before SDK creation
- Support dynamic model discovery via hook
- Cache discovered models per provider

**Files:**
- `packages/plugin/src/index.ts` (add hook type)
- `packages/opencode/src/plugin/index.ts` (trigger hook)
- `packages/opencode/src/provider/provider.ts` (call hook)

**Example Hook:**
```typescript
"provider.init"?: (
  input: { providerID: string; provider: ProviderContext },
  output: { options: Record<string, any>; models?: Record<string, Model> }
) => Promise<void>
```

---

### PR #4: Connection Validation in getSDK
**Why upstream:** Prevents silent failures and improves error messages.

**Changes:**
- Add optional connection test before SDK initialization
- Use health check if configured
- Better error context for connection failures
- Don't block initialization, but log warnings

**Files:**
- `packages/opencode/src/provider/provider.ts` (getSDK function)

---

## Plugin: `opencode-lmstudio`

### Features (Optional/Opinionated)

1. **Auto-detection**
   - Scan common ports (1234, 8080, etc.)
   - Detect LM Studio server automatically
   - Environment variable: `LMSTUDIO_PORT` override

2. **Dynamic Model Discovery**
   - Query LM Studio's `/v1/models` endpoint
   - Cache discovered models
   - Auto-update when models change
   - Merge with config-defined models

3. **Auto-configuration**
   - Automatically add `lmstudio` provider if detected
   - Sensible defaults (port 1234, baseURL)
   - Optional: auto-enable in provider list

4. **Health Monitoring**
   - Periodic health checks
   - Show connection status in UI (via events)
   - Graceful degradation when server offline

5. **Enhanced Error Messages**
   - LM Studio-specific troubleshooting tips
   - Link to LM Studio documentation
   - Port conflict detection

### Plugin Architecture

```typescript
export const LMStudioPlugin: Plugin = async (ctx) => {
  return {
    "provider.init": async (input, output) => {
      if (input.providerID === "lmstudio") {
        // Auto-detect server
        const detected = await detectLMStudio()
        if (detected) {
          output.options.baseURL = detected.baseURL
        }
        
        // Discover models
        const models = await discoverModels(detected.baseURL)
        output.models = models
      }
    },
    event: async ({ event }) => {
      // Emit health check events
    }
  }
}
```

### Installation

```json
{
  "plugin": ["opencode-lmstudio"]
}
```

---

## Summary

| Feature | Location | Reason |
|---------|----------|--------|
| Health check infrastructure | Upstream | Core functionality for all providers |
| Better error messages | Upstream | UX improvement for all users |
| Provider init hook | Upstream | Enables plugins to work |
| Connection validation | Upstream | Prevents silent failures |
| Auto-detection | Plugin | Opinionated, optional |
| Dynamic model discovery | Plugin | Requires API calls, caching |
| Auto-configuration | Plugin | Opinionated, not for everyone |
| Port scanning | Plugin | Optional, might not be desired |
| LM Studio-specific UI | Plugin | Provider-specific enhancement |

---

## Implementation Plan

1. **Phase 1: Upstream Infrastructure** (PRs #1-4)
   - Add health check support
   - Improve error messages
   - Add provider init hook
   - Add connection validation

2. **Phase 2: Plugin Development**
   - Create `opencode-lmstudio` plugin
   - Implement auto-detection
   - Implement model discovery
   - Add health monitoring

3. **Phase 3: Documentation**
   - Update provider docs with LM Studio examples
   - Document plugin usage
   - Add troubleshooting guide

