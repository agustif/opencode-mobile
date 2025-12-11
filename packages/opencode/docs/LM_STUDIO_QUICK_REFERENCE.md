# LM Studio Support: Quick Reference

## Current Status

✅ **Supported** - LM Studio works via manual configuration  
⚠️ **Limited** - No auto-detection, no health checks, generic errors

## Quick Start

### Basic Configuration

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "lmstudio": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LM Studio (local)",
      "options": {
        "baseURL": "http://127.0.0.1:1234/v1"
      },
      "models": {
        "model-id": {
          "name": "Model Name"
        }
      }
    }
  }
}
```

## Planned Improvements

### Upstream PRs (Core Infrastructure)

| PR | Feature | Status | Priority |
|----|---------|--------|----------|
| #1 | Health Check Infrastructure | Planned | High |
| #2 | Enhanced Error Messages | Planned | High |
| #3 | Provider Init Hook | Planned | Medium |
| #4 | Connection Validation | Planned | Medium |

### Plugin (Optional Enhancement)

| Feature | Status | Priority |
|---------|--------|----------|
| `opencode-lmstudio` | Planned | Low |

## Common Issues & Solutions

### Issue: "Failed to initialize provider"

**Current:** Generic error message  
**After PR #2:** Context-aware hints:
- "Is LM Studio running?"
- "Check if server is accessible at http://127.0.0.1:1234/v1"
- "Verify port number in configuration"

### Issue: Server offline

**Current:** Error only appears when using model  
**After PR #1:** Health check warns on initialization

### Issue: Manual model configuration

**Current:** Must manually list all models  
**After Plugin:** Auto-discovery from `/v1/models` endpoint

## Documentation

- **Deep Review:** `LM_STUDIO_DEEP_REVIEW.md` - Complete technical analysis
- **Support Plan:** `LM_STUDIO_SUPPORT.md` - Architecture decisions
- **Provider Docs:** `packages/web/src/content/docs/providers.mdx` - User documentation

## Implementation Status

- [x] Analysis complete
- [x] Architecture decisions made
- [ ] PR #1: Health Check Infrastructure
- [ ] PR #2: Enhanced Error Messages
- [ ] PR #3: Provider Init Hook
- [ ] PR #4: Connection Validation
- [ ] Plugin: `opencode-lmstudio`
- [ ] Documentation updates

## Key Files

### Core
- `packages/opencode/src/provider/provider.ts` - Provider initialization
- `packages/opencode/src/cli/error.ts` - Error formatting
- `packages/opencode/src/provider/transform.ts` - Error transformation

### Plugin System
- `packages/plugin/src/index.ts` - Plugin types
- `packages/opencode/src/plugin/index.ts` - Plugin loader

### Documentation
- `packages/web/src/content/docs/providers.mdx` - User docs
- `packages/opencode/docs/LM_STUDIO_DEEP_REVIEW.md` - Technical review

## Next Steps

1. Review and approve architecture decisions
2. Implement PR #1 (Health Check Infrastructure)
3. Implement PR #2 (Enhanced Error Messages)
4. Implement PR #3 (Provider Init Hook)
5. Implement PR #4 (Connection Validation)
6. Create `opencode-lmstudio` plugin
7. Update documentation
8. Test and release

