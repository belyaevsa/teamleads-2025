using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using TeamleadsBackend.Security;
using Xunit;

namespace TeamleadsBackend.Tests;

// Which header decides "who is calling" – the trust boundary for every per-IP control
// in this app: the rate limiter partitions on it (Program.cs) and the stored ip_hash on
// feedback, submissions, anon requests and pastes is derived from it.
//
// The defect these tests exist to prevent was live: ClientIp read the FIRST entry of
// X-Forwarded-For, and nginx builds that header with $proxy_add_x_forwarded_for, which
// appends $remote_addr to whatever the caller sent. First entry = caller input. A
// rotating header walked straight through a 5/min limiter, 12 requests for 12 fake
// addresses, and every ip_hash written along the way named an address of the sender's
// choosing.
public class ClientFingerprintTests
{
    private static DefaultHttpContext Request(string? realIp = null, string? forwardedFor = null, string? peer = "198.51.100.9")
    {
        var http = new DefaultHttpContext();
        if (realIp is not null) http.Request.Headers["X-Real-IP"] = realIp;
        if (forwardedFor is not null) http.Request.Headers["X-Forwarded-For"] = forwardedFor;
        if (peer is not null) http.Connection.RemoteIpAddress = System.Net.IPAddress.Parse(peer);
        return http;
    }

    private static IConfiguration Config(string? salt = "pepper") =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(salt is null ? [] : new Dictionary<string, string?> { ["IP_HASH_SALT"] = salt })
            .Build();

    // The regression, stated directly.
    [Fact]
    public void A_client_supplied_forwarded_for_does_not_decide_who_the_caller_is()
    {
        var http = Request(realIp: "203.0.113.9", forwardedFor: "1.2.3.4, 203.0.113.9");

        Assert.Equal("203.0.113.9", ClientFingerprint.ClientIp(http));
    }

    // The same claim one layer up: if the spoof changed the hash, it would change the
    // rate-limit partition and the stored abuse trail with it.
    [Fact]
    public void A_spoofed_forwarded_for_cannot_move_the_ip_hash()
    {
        var cfg = Config();
        var honest = ClientFingerprint.IpHash(Request(realIp: "203.0.113.9"), cfg);
        var spoofed = ClientFingerprint.IpHash(
            Request(realIp: "203.0.113.9", forwardedFor: "1.2.3.4, 203.0.113.9"), cfg);

        Assert.Equal(honest, spoofed);
    }

    // nginx overwrites X-Real-IP with $remote_addr, so what arrives here is the TCP peer
    // of the connection nginx accepted, and the caller has no say in it.
    [Fact]
    public void The_real_ip_header_is_what_identifies_the_caller()
    {
        Assert.Equal("203.0.113.9", ClientFingerprint.ClientIp(Request(realIp: "203.0.113.9")));
    }

    // Dev host, direct container access, a test: no proxy, so the socket answers.
    [Fact]
    public void With_no_proxy_in_front_the_connection_address_is_used()
    {
        Assert.Equal("198.51.100.9", ClientFingerprint.ClientIp(Request()));
    }

    // A partition key of "" would put every anonymous caller in one bucket – shared, and
    // therefore trivially exhausted for everyone else. Never empty.
    [Fact]
    public void An_unidentifiable_caller_still_gets_a_partition_key()
    {
        Assert.Equal("unknown", ClientFingerprint.ClientIp(Request(peer: null)));
    }

    // Rate limiting still has to work: two different callers must not share a bucket.
    [Fact]
    public void Different_callers_hash_differently()
    {
        var cfg = Config();
        Assert.NotEqual(
            ClientFingerprint.IpHash(Request(realIp: "203.0.113.1"), cfg),
            ClientFingerprint.IpHash(Request(realIp: "203.0.113.2"), cfg));
    }

    // Without a salt the hash is a plain SHA-256 of an IP – a rainbow table over the whole
    // v4 space is minutes of work, so the row would be personal data pretending not to be.
    // Storing nothing is the honest outcome.
    [Fact]
    public void No_salt_configured_means_no_hash_rather_than_a_weak_one()
    {
        Assert.Null(ClientFingerprint.IpHash(Request(realIp: "203.0.113.9"), Config(salt: null)));
    }
}
