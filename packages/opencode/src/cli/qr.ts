import { Log } from "../util/log"

const log = Log.create({ service: "cli.qr" })

export async function printQRCode(text: string) {
  try {
    const mod: any = await import("qrcode-terminal")
    const qr = mod.default ?? mod
    if (!qr?.generate) throw new Error("qrcode-terminal not available")
    qr.generate(text, { small: true })
  } catch (error) {
    log.warn("qr generation failed", { error })
    console.log(text)
  }
}
