import { Server } from "../../server/server"
import { cmd } from "./cmd"
import { getNetworkIPs, resolveConnectHost } from "../net"
import { printQRCode } from "../qr"

export const ServeCommand = cmd({
  command: "serve",
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
    console.log(`opencode server listening on http://${server.hostname}:${server.port}`)
    if (hostname === "0.0.0.0") {
      const networkIPs = getNetworkIPs()
      for (const ip of networkIPs) {
        console.log(`network access: http://${ip}:${server.port}`)
      }
    }
    if (args.qr) {
      const connectHost = resolveConnectHost(hostname)
      const connectUrl = `http://${connectHost}:${server.port}`
      const deepLink = `opencode://connect?url=${encodeURIComponent(connectUrl)}`
      console.log(`connect url: ${connectUrl}`)
      await printQRCode(deepLink)
    }
    await new Promise(() => {})
    await server.stop()
  },
})
