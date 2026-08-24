using System.Net;
using System.Net.Sockets;
using System.Text;

namespace TeamleadsBackend.Tests.Support;

// A real HTTP endpoint on 127.0.0.1, for clients that own their HttpClient.
//
// StubBotApi fakes the hand-rolled TelegramClient by handing that client an HttpClient
// built on a stub handler. Bucketlab.Telebot's DefaultTelegramTransport cannot be faked
// that way: it constructs its own HttpClient from DefaultTransportOptions and exposes no
// handler seam, so the only observation point left is a socket it can genuinely reach.
// This is one, pinned to an OS-chosen port and answering scripted bodies.
//
// The point is StubBotApi's, one layer up: the bytes the REAL transport puts on the wire
// and the JSON it parses back are the contract, and a package upgrade is exactly where
// that changes without the compiler noticing.
public sealed class LocalBotApi : IDisposable
{
    private readonly HttpListener _listener;
    private readonly Thread _loop;
    private readonly object _gate = new();
    private readonly List<Call> _calls = [];
    private readonly Queue<(HttpStatusCode Status, string Body)> _responses = new();

    public string BaseAddress { get; }

    // Guarded rather than concurrent collections: the listener thread is the only writer
    // and a test the only reader, so a lock keeps LastCall honest without a queue's
    // "cannot look at the tail" awkwardness.
    public IReadOnlyList<Call> Calls { get { lock (_gate) return [.. _calls]; } }

    public Call LastCall
    {
        get
        {
            lock (_gate)
                return _calls.Count > 0 ? _calls[^1] : throw new InvalidOperationException("No call was made.");
        }
    }

    public sealed record Call(string Path, string Body)
    {
        // The form fields the transport sent, decoded. Telebot posts form-urlencoded
        // bodies, so this is the Bot API's own view of the request: every field by its
        // Bot API name, composite ones still as JSON text (see StubTelebotTransport).
        public IReadOnlyDictionary<string, string> Fields =>
            Body.Split('&')
                .Select(p => p.Split('=', 2))
                .ToDictionary(
                    kv => System.Net.WebUtility.UrlDecode(kv[0]),
                    kv => kv.Length > 1 ? System.Net.WebUtility.UrlDecode(kv[1]) : "");
    }

    // `ok: true` wrapping an arbitrary result payload.
    public LocalBotApi RespondsOk(string rawResult) =>
        Responds(HttpStatusCode.OK, $$"""{"ok":true,"result":{{rawResult}}}""");

    // Telegram's own failure shape: 200 or 4xx carrying ok:false plus a description.
    public LocalBotApi RespondsError(string description, HttpStatusCode status = HttpStatusCode.BadRequest) =>
        Responds(status, $$"""{"ok":false,"error_code":400,"description":{{System.Text.Json.JsonSerializer.Serialize(description)}}}""");

    public LocalBotApi Responds(HttpStatusCode status, string body)
    {
        lock (_gate) _responses.Enqueue((status, body));
        return this;
    }

    public LocalBotApi()
    {
        // A port picked by asking for one and releasing it, so the listener is not pinned
        // to a fixed number that parallel runs or a previous test host might still hold.
        // The ask-then-release window is small; a second attempt covers the rest.
        for (var attempt = 0; ; attempt++)
        {
            var port = FreeTcpPort();
            BaseAddress = $"http://127.0.0.1:{port}/";
            _listener = new HttpListener();
            _listener.Prefixes.Add(BaseAddress);
            try
            {
                _listener.Start();
                break;
            }
            catch (HttpListenerException) when (attempt < 2)
            {
                _listener.Close();
            }
        }

        _loop = new Thread(AcceptLoop) { IsBackground = true };
        _loop.Start();
    }

    // One request at a time on a listener thread. The tests are sequential within
    // themselves, and keeping the loop single-threaded is what makes Calls' order and
    // the scripted responses' order mean the same thing.
    private void AcceptLoop()
    {
        while (_listener.IsListening)
        {
            HttpListenerContext context;
            try
            {
                context = _listener.GetContext();
            }
            catch (Exception) when (!_listener.IsListening)
            {
                return;   // disposed mid-wait – the one way out that is not an error
            }

            using var reader = new StreamReader(context.Request.InputStream, Encoding.UTF8);
            var body = reader.ReadToEnd();
            lock (_gate) _calls.Add(new Call(context.Request.Url!.AbsolutePath, body));

            // Default to a body nothing downstream is happy with but nothing hangs on:
            // every test scripts what it means to observe.
            var (status, responseBody) = NextResponse();

            var bytes = Encoding.UTF8.GetBytes(responseBody);
            context.Response.StatusCode = (int)status;
            context.Response.ContentType = "application/json; charset=utf-8";
            context.Response.ContentLength64 = bytes.Length;
            context.Response.OutputStream.Write(bytes, 0, bytes.Length);
            context.Response.Close();
        }
    }

    private (HttpStatusCode Status, string Body) NextResponse()
    {
        lock (_gate)
            return _responses.Count > 0 ? _responses.Dequeue() : (HttpStatusCode.OK, """{"ok":true,"result":true}""");
    }

    private static int FreeTcpPort()
    {
        var probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        var port = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        return port;
    }

    public void Dispose()
    {
        ((IDisposable)_listener).Dispose();
        _loop.Join(TimeSpan.FromSeconds(2));
    }
}
