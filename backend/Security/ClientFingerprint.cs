using System.Security.Cryptography;
using System.Text;

namespace TeamleadsBackend.Security;

// Client identification for abuse triage + rate-limit partitioning.
//
// The container only ever receives traffic from nginx (the port is bound to
// 127.0.0.1 on the host), so the real client IP is the first hop of the
// X-Forwarded-For header nginx sets. We read it directly rather than via the
// ForwardedHeaders middleware: that avoids the KnownNetworks/IPNetwork typing
// churn across .NET versions, and the header is trustworthy because nothing but
// nginx can reach this listener.
public static class ClientFingerprint
{
    public static string ClientIp(HttpContext http)
    {
        var xff = http.Request.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrEmpty(xff))
        {
            var first = xff.Split(',', 2)[0].Trim();
            if (first.Length > 0) return first;
        }
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
