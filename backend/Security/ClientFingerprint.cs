using System.Security.Cryptography;
using System.Text;

namespace TeamleadsBackend.Security;

// Client identification for abuse triage + rate-limit partitioning.
//
// The container only ever receives traffic from nginx (the port is bound to
// 127.0.0.1 on the host), so the address comes from a header. WHICH header is the
// whole security property of this file.
//
// X-Real-IP, because nginx sets it to $remote_addr – the peer of the TCP connection,
// which no client can influence – and proxy_set_header OVERWRITES whatever the client
// sent under that name. See landing-main/infra/teamleads.kz.conf.
//
// NOT X-Forwarded-For. nginx builds that one with $proxy_add_x_forwarded_for, which
// appends $remote_addr to the value the client supplied, so its FIRST entry is written
// by the caller. Reading it made every per-IP control in this app opt-out: a rotating
// header defeated the rate limiter on /api/anon, /api/feedback, /api/submissions and
// /api/pastes, and poisoned the stored ip_hash so an abuse trail could name any address
// the sender chose. Confirmed against production, 12/12 requests through a 5/min limit.
//
// The rule that generalises: only ever trust a forwarded header the proxy is known to
// overwrite. A header the proxy appends to is caller input wearing a trusted name.
// The nginx access log records the raw client-sent values (xff=/xri=) so the attempts
// stay visible even though nothing reads them any more.
public static class ClientFingerprint
{
    public static string ClientIp(HttpContext http)
    {
        var real = http.Request.Headers["X-Real-IP"].ToString().Trim();
        if (real.Length > 0) return real;

        // No nginx in front: the dev host, a container reached directly, or a test.
        // The connection's own address is as good as it gets and cannot be spoofed.
        return http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    // Salted, non-reversible hash of the IP so public POSTs can be triaged without
    // storing a raw address. With no IP_HASH_SALT configured we return null rather
    // than emit a weak, unsalted hash.
    public static string? IpHash(HttpContext http, IConfiguration config)
    {
        var salt = config["IP_HASH_SALT"];
        if (string.IsNullOrEmpty(salt)) return null;

        return Hash(ClientIp(http), config);
    }

    // Same salted hash for any other author identifier (e.g. a telegram user id).
    // The caller passes a namespaced value like "tg|12345" so identifiers from
    // different sources can never collide.
    public static string? Hash(string value, IConfiguration config)
    {
        var salt = config["IP_HASH_SALT"];
        if (string.IsNullOrEmpty(salt)) return null;

        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(salt + "|" + value));
        return Convert.ToHexStringLower(bytes);
    }
}
