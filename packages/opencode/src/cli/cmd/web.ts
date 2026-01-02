import { Server } from "../../server/server"
import { UI } from "../ui"
import { cmd } from "./cmd"
import open from "open"
import { getNetworkIPs, resolveConnectHost } from "../net"
import { printQRCode } from "../qr"

export const WebCommand = cmd({
  command: "web",
  builder: (yargs) =>
    yargs
      .option("port", {
        alias: ["p"],
        type: "number",
        describe: "port to listen on",
        default: 0,
      })
      .option("hostname", {
        type: "string",
        describe: "hostname to listen on",
        default: "127.0.0.1",
      })
      .option("discover", {
        type: "boolean",
        describe: "advertise on LAN via Bonjour (mDNS)",
      })
      .option("name", {
        type: "string",
        describe: "Bonjour service name",
      })
      .option("qr", {
        type: "boolean",
        describe: "print QR code for mobile pairing",
        default: false,
      }),
  describe: "starts a headless opencode server",
  handler: async (args) => {
    const hostname = args.hostname
    const port = args.port
    const discover =
      typeof args.discover === "boolean" ? args.discover : hostname !== "127.0.0.1" && hostname !== "localhost"
    const server = Server.listen({
      port,
      hostname,
      discover: discover
        ? {
            name: args.name,
            txt: {
              path: "/",
            },
          }
        : undefined,
    })
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()

    if (hostname === "0.0.0.0") {
      // Show localhost for local access
      const localhostUrl = `http://localhost:${server.port}`
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Local access:      ", UI.Style.TEXT_NORMAL, localhostUrl)

      // Show network IPs for remote access
      const networkIPs = getNetworkIPs()
      if (networkIPs.length > 0) {
        for (const ip of networkIPs) {
          UI.println(
            UI.Style.TEXT_INFO_BOLD + "  Network access:    ",
            UI.Style.TEXT_NORMAL,
            `http://${ip}:${server.port}`,
          )
        }
      }

      // Open localhost in browser
      open(localhostUrl.toString()).catch(() => {})
      if (args.qr) {
        const connectHost = resolveConnectHost(hostname)
        const connectUrl = `http://${connectHost}:${server.port}`
        const deepLink = `opencode://connect?url=${encodeURIComponent(connectUrl)}`
        UI.println(UI.Style.TEXT_INFO_BOLD + "  Mobile connect:   ", UI.Style.TEXT_NORMAL, deepLink)
        await printQRCode(deepLink)
      }
    } else {
      const displayUrl = server.url.toString()
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Web interface:    ", UI.Style.TEXT_NORMAL, displayUrl)
      open(displayUrl).catch(() => {})
      if (args.qr) {
        const connectHost = resolveConnectHost(hostname)
        const connectUrl = `http://${connectHost}:${server.port}`
        const deepLink = `opencode://connect?url=${encodeURIComponent(connectUrl)}`
        UI.println(UI.Style.TEXT_INFO_BOLD + "  Mobile connect:   ", UI.Style.TEXT_NORMAL, deepLink)
        await printQRCode(deepLink)
      }
    }

    await new Promise(() => {})
    await server.stop()
  },
})
