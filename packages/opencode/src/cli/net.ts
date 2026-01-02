import { networkInterfaces } from "os"

export function getNetworkIPs() {
  const nets = networkInterfaces()
  const results: string[] = []

  for (const name of Object.keys(nets)) {
    const net = nets[name]
    if (!net) continue

    for (const netInfo of net) {
      if (netInfo.internal || netInfo.family !== "IPv4") continue
      if (netInfo.address.startsWith("172.")) continue
      results.push(netInfo.address)
    }
  }

  return results
}

export function resolveConnectHost(hostname: string) {
  if (hostname !== "0.0.0.0") return hostname
  const ips = getNetworkIPs()
  return ips[0] ?? "localhost"
}
