import dns from "dns";
import net from "net";

// This network's router-provided DNS resolver intermittently SERVFAILs or
// times out on external hosts (MongoDB Atlas shard hosts, Clerk's API) that
// Google/Cloudflare's resolvers answer fine. `dns.setServers()` alone isn't
// enough: it only redirects the c-ares-based `dns.resolve*()` family (what
// Mongoose's replica-set discovery uses) — `dns.lookup()`, which is what
// Node's native `fetch`/undici (and therefore Clerk's SDK) uses under the
// hood, asks the OS resolver via getaddrinfo and ignores `setServers()`
// entirely. So both pieces are needed: point the c-ares resolvers at a
// working DNS server, then redirect `dns.lookup` itself through them.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const resolve4 = dns.promises.resolve4.bind(dns.promises);
const resolve6 = dns.promises.resolve6.bind(dns.promises);

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

async function resolveHost(hostname: string, family?: number, all?: boolean) {
  if (family === 6) {
    const addrs = await resolve6(hostname);
    return addrs.map((address) => ({ address, family: 6 }));
  }
  try {
    const addrs = await resolve4(hostname);
    return addrs.map((address) => ({ address, family: 4 }));
  } catch (err) {
    if (family === 4) throw err;
    const addrs = await resolve6(hostname);
    return addrs.map((address) => ({ address, family: 6 }));
  }
}

// @ts-expect-error - narrowing dns.lookup's overloaded signature to the
// subset Node's own http/undici stack actually calls it with.
dns.lookup = (hostname: string, optionsOrCallback: unknown, maybeCallback?: LookupCallback) => {
  const callback = (typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback) as LookupCallback;
  const options = (typeof optionsOrCallback === "function" ? {} : optionsOrCallback ?? {}) as {
    family?: number;
    all?: boolean;
  };

  // IP literals aren't DNS queries — dns.resolve* would reject them outright.
  if (net.isIP(hostname)) {
    const family = net.isIP(hostname) === 6 ? 6 : 4;
    if (options.all) return callback(null, [{ address: hostname, family }]);
    return callback(null, hostname, family);
  }

  resolveHost(hostname, options.family, options.all)
    .then((results) => {
      if (options.all) return callback(null, results);
      callback(null, results[0].address, results[0].family);
    })
    .catch((err) => callback(err));
};
