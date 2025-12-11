# Code Style Research Summary

## Key Patterns Identified

### 1. Error Handling
- **Pattern:** `NamedError.create(name, zodSchema)`
- **Usage:** `throw new ErrorClass({ data }, { cause: e })`
- **Checking:** `ErrorClass.isInstance(input)`
- **Example:**
  ```typescript
  export const InitError = NamedError.create(
    "ProviderInitError",
    z.object({ providerID: z.string() }),
  )
  throw new InitError({ providerID }, { cause: e })
  ```

### 2. Logging
- **Pattern:** `Log.create({ service: "name" })`
- **Methods:** `log.info()`, `log.warn()`, `log.error()`, `log.debug()`
- **Timing:** `using _ = log.time("operation", { extra })`
- **Structured:** Always pass objects as second parameter
- **Example:**
  ```typescript
  const log = Log.create({ service: "provider" })
  using _ = log.time("getSDK", { providerID: model.providerID })
  log.info("using bundled provider", { providerID, pkg: bundledKey })
  ```

### 3. State Management
- **Pattern:** `Instance.state(async () => { ... })`
- **Returns:** Function that returns state
- **Cached:** Per directory/instance
- **Example:**
  ```typescript
  const state = Instance.state(async () => {
    // initialization
    return { providers, sdk, ... }
  })
  const s = await state()
  ```

### 4. Async Patterns
- **Style:** `async function` declarations
- **Error:** `try/catch` with proper wrapping
- **State:** `await state()` pattern
- **Chaining:** `.then()` for simple transformations only
- **Example:**
  ```typescript
  async function getSDK(model: Model) {
    try {
      const s = await state()
      // ...
    } catch (e) {
      throw new InitError({ providerID }, { cause: e })
    }
  }
  ```

### 5. Network/Fetch
- **Timeout:** `AbortSignal.timeout(ms)`
- **Combine:** `AbortSignal.any([...signals])`
- **Manual:** `AbortController` with `setTimeout`
- **Error:** Catch and log, don't throw unless critical
- **Example:**
  ```typescript
  const result = await fetch(url, {
    signal: AbortSignal.timeout(10 * 1000),
  }).catch((e) => {
    log.error("Failed to fetch", { error: e })
  })
  ```

### 6. Config Schema
- **Pattern:** Zod with `.describe()` for docs
- **Optional:** `.optional()` for optional fields
- **Default:** `.default(value)` for defaults
- **Strict:** `.strict()` for strict validation
- **Merge:** `mergeDeep()` from remeda
- **Example:**
  ```typescript
  export const Provider = z.object({
    healthCheck: z.object({
      url: z.string().optional().describe("Health check URL"),
      timeout: z.number().int().positive().default(2000),
      enabled: z.boolean().default(true),
    }).optional(),
  }).strict()
  ```

### 7. Testing
- **Framework:** `bun:test`
- **Pattern:** `test()`, `describe()`, `expect()`
- **Setup:** `Instance.provide()` for test context
- **Example:**
  ```typescript
  test("provider loaded from env", async () => {
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const providers = await Provider.list()
        expect(providers["anthropic"]).toBeDefined()
      },
    })
  })
  ```

### 8. Code Organization
- **Namespaces:** `export namespace Provider { ... }`
- **Private:** Functions not exported are private
- **Helpers:** `iife()` for immediate execution
- **Disposal:** `using _` for resource disposal
- **Types:** Strict TypeScript
- **Utils:** Remeda (`mapValues`, `mergeDeep`, `sortBy`)

### 9. Function Naming
- **Private:** `async function name()` (not exported)
- **Public:** `export async function name()`
- **Internal:** Functions inside namespace
- **Helpers:** Lowercase, descriptive names

### 10. Error Messages
- **Format:** Arrays joined with `\n`
- **Structure:** Title, hints, original error
- **Context:** Include relevant IDs/URLs
- **Example:**
  ```typescript
  return [
    `Failed to connect to provider "${providerID}"`,
    "",
    ...hints.map(hint => `  • ${hint}`),
    "",
    `Original error: ${cause?.message}`,
  ].join("\n")
  ```

## Implementation Guidelines

1. **Always use `using _ = log.time()` for operations**
2. **Wrap errors with `{ cause: e }`**
3. **Use structured logging with objects**
4. **Follow existing namespace patterns**
5. **Use Zod for all config schemas**
6. **Use `mergeDeep` for merging objects**
7. **Use `AbortSignal.timeout()` for timeouts**
8. **Don't block initialization with health checks**
9. **Log warnings, don't throw for non-critical failures**
10. **Follow existing error formatting patterns**

