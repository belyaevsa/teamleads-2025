using System.Net;
using System.Text;

namespace TeamleadsBackend.Tests.Support;

// The site's own JSON feeds (bot-data.json, shell-index.json) under HttpClient.
//
// Not a Telegram thing, but the dilemma, question and search paths all need one before
// they will call Telegram at all, and a test that has to lay out a real file on disk to
// get there stops being about the bot.
public sealed class StubFeed(string json, HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler
{
    public List<string> RequestedUrls { get; } = [];

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        RequestedUrls.Add(request.RequestUri!.ToString());
        return Task.FromResult(new HttpResponseMessage(status)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json"),
        });
    }
}
