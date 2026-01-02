import os from "os"
import { Log } from "../util/log"

const log = Log.create({ service: "discovery" })

export type BonjourOptions = {
  name: string
  port: number
  type?: string
  protocol?: "tcp" | "udp"
  txt?: Record<string, string>
}

export type BonjourHandle = {
  stop: () => void
}

export async function startBonjour(options: BonjourOptions): Promise<BonjourHandle | undefined> {
  try {
    const mod: any = await import("bonjour-service")
    const Bonjour = mod.Bonjour ?? mod.default?.Bonjour ?? mod.default
    if (!Bonjour) throw new Error("bonjour-service export not found")

    const bonjour = new Bonjour()
    const service = bonjour.publish({
      name: options.name,
      type: options.type ?? "opencode",
      protocol: options.protocol ?? "tcp",
      port: options.port,
      txt: options.txt ?? {},
    })

    log.info("bonjour started", {
      name: options.name,
      type: options.type ?? "opencode",
      port: options.port,
    })

    return {
      stop: () => {
        try {
          service.stop()
          bonjour.destroy()
          log.info("bonjour stopped")
        } catch (error) {
          log.warn("bonjour stop failed", { error })
        }
      },
    }
  } catch (error) {
    log.warn("bonjour unavailable", { error })
    return undefined
  }
}

export function defaultServiceName() {
  return `opencode-${os.hostname()}`
}
