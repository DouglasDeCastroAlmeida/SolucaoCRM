import { describe, expect, it } from "vitest";

import { ipEhEspecial } from "@/lib/automation/outbound-ip";

describe("ipEhEspecial: IPv4 escondido em IPv6", () => {
  it.each([
    ["mapeado hex loopback (host de new URL)", "::ffff:7f00:1"],
    ["mapeado hex metadata", "::ffff:a9fe:a9fe"],
    ["mapeado hex RFC1918", "::ffff:0a00:0001"],
    ["compativel com IPv4", "::7f00:1"],
    ["mapeado com zeros", "::ffff:0:7f00:1"],
    ["link-local fe80", "fe80::1"],
    ["link-local febf", "febf::1"],
    ["link-local fe90", "fe90::1"],
    ["site-local fec0", "fec0::1"],
    ["6to4", "2002:7f00:1::"],
    ["NAT64 com loopback", "64:ff9b::7f00:1"],
    ["NAT64 com metadata", "64:ff9b::a9fe:a9fe"],
    ["loopback expandido", "0:0:0:0:0:0:0:1"],
  ])("AC-002.1: %s e especial", (_nome, ip) => {
    expect(ipEhEspecial(ip)).toBe(true);
  });

  it.each([
    ["Google DNS v6", "2001:4860:4860::8888"],
    ["mapeado hex publico", "::ffff:0808:0808"],
    ["Cloudflare v6", "2606:4700:4700::1111"],
  ])("controle: %s passa", (_nome, ip) => {
    expect(ipEhEspecial(ip)).toBe(false);
  });

  it("o hostname que new URL produz para IPv4 mapeado tambem e recusado", () => {
    const host = new URL("https://[::ffff:127.0.0.1]/").hostname.replace(/^\[|\]$/g, "");
    expect(ipEhEspecial(host)).toBe(true);
  });
});
