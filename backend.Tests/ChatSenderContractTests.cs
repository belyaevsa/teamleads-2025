using System.Text.Json;
using TeamleadsBackend.Telegram;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// What every IChatSender adapter must do, regardless of which client is underneath.
//
// OutboxTests proves the delivery loop is correct against the port. This file proves an
// adapter actually honours the port – the other half, and the half that a client swap
// puts at risk. Both are needed: a fake that always behaves cannot tell you your real
// client translates a timeout into a retry rather than an escaping exception.
//
// TO ADD AN ADAPTER: subclass this, return your adapter from CreateSender, and implement
// the transport hooks. If a case cannot be expressed against your client, that is a
// behaviour change – say so in an override with a comment, do not delete the test.
public abstract class ChatSenderContractTests
{
    protected abstract IChatSender CreateSender(TestHost host);

    /// Make the next send succeed, reporting this message id.
    protected abstract void GivenDelivers(TestHost host, long messageId);

    /// Make the next send fail the way the remote service reports a refusal.
    protected abstract void GivenApiError(TestHost host, string description);

    /// Make the next send fail the way a dead or slow socket does.
    protected abstract void GivenTransportFailure(TestHost host, Exception ex);

    /// Make the next send fail the way Telegram refuses a chat that has been upgraded to
    /// a supergroup: a refusal that carries the chat's new id.
    protected abstract void GivenChatMigrated(TestHost host, long newChatId);

    /// The reply markup the adapter passed on, as JSON – null if it sent none.
    protected abstract JsonElement? SentReplyMarkup(TestHost host);

    /// Whether the adapter told the remote service to suppress link previews.
    protected abstract bool? SentDisablePreview(TestHost host);

    /// The last call's fields by their Bot API name, values as raw text (JSON for the
    /// composite ones). Only names both clients agree on are asserted through this –
    /// chat_id, message_id, text, question, options, callback_query_id – so it stays a
    /// statement about the Bot API rather than about one library's spelling.
    protected abstract IReadOnlyDictionary<string, string> SentFields(TestHost host);

    /// The Bot API method the last call went to.
    protected abstract string SentMethod(TestHost host);

    private static ChatMessage Message(string text = "hi", string? markupJson = null, bool disablePreview = true) =>
        new(-100500, text, markupJson, disablePreview);

    // Both clients JSON-escape Cyrillic on the way out, and one wraps each option in an
    // object while the other sends bare strings. Decoding is what makes the assertion
    // about the options rather than about an escaping convention.
    private static IEnumerable<string> OptionLabels(string optionsJson) =>
        JsonDocument.Parse(optionsJson).RootElement.EnumerateArray()
            .Select(o => o.ValueKind == JsonValueKind.Object ? o.GetProperty("text").GetString()! : o.GetString()!);

    [Fact]
    public async Task Delivery_reports_ok_and_the_message_id()
    {
        using var host = new TestHost();
        GivenDelivers(host, 61217);

        var outcome = await CreateSender(host).SendMessageAsync(Message(), CancellationToken.None);

        Assert.True(outcome.Ok);
        Assert.Equal(61217, outcome.MessageId);
        Assert.Null(outcome.Error);
    }

    [Fact]
    public async Task An_api_refusal_becomes_a_failed_outcome_carrying_the_reason()
    {
        using var host = new TestHost();
        GivenApiError(host, "Forbidden: bot was kicked from the supergroup chat");

        var outcome = await CreateSender(host).SendMessageAsync(Message(), CancellationToken.None);

        Assert.False(outcome.Ok);
        // This string is what the admin sees and what lands in OutboxMessage.LastError.
        // Losing it turns every failure into an indistinguishable "unknown".
        Assert.Contains("kicked", outcome.Error);
    }

    [Fact]
    public async Task A_dead_socket_becomes_a_failed_outcome_not_an_exception()
    {
        using var host = new TestHost();
        GivenTransportFailure(host, new HttpRequestException("Connection reset by peer"));

        var outcome = await CreateSender(host).SendMessageAsync(Message(), CancellationToken.None);

        Assert.False(outcome.Ok);
        Assert.NotNull(outcome.Error);
    }

    // The case that motivated this whole file.
    //
    // HttpClient reports its OWN timeout as TaskCanceledException, which derives from
    // OperationCanceledException. An adapter that filters on OperationCanceledException
    // to let shutdown through cannot tell a slow Telegram from a container stopping, and
    // a timed-out send escapes into DispatchDueAsync – which discards the batch. See
    // OutboxTests.An_exception_escaping_the_adapter_discards_the_whole_batch.
    [Fact]
    public async Task A_client_timeout_becomes_a_failed_outcome_not_an_exception()
    {
        using var host = new TestHost();
        GivenTransportFailure(host, new TaskCanceledException(
            "The request was canceled due to the configured HttpClient.Timeout of 15 seconds elapsing."));

        // The caller's token is NOT cancelled: this is the client giving up, not shutdown.
        var outcome = await CreateSender(host).SendMessageAsync(Message(), CancellationToken.None);

        Assert.False(outcome.Ok);
        Assert.NotNull(outcome.Error);
    }

    // A refusal the delivery loop can act on instead of retrying into a wall.
    //
    // Telegram gives a group a new id when it is upgraded to a supergroup and answers
    // sends to the old one with parameters.migrate_to_chat_id. An adapter that flattens
    // that into a plain failure throws the fix away: every retry uses the same retired id,
    // the ladder runs out, and the message dies. Outbox 6 – an anon moderation card – did
    // exactly that, five attempts deep, on the day the admin group was upgraded.
    //
    // Each adapter learns this differently (a JSON field, an exception message), which is
    // the whole reason it is asserted per adapter rather than once in OutboxTests.
    [Fact]
    public async Task A_supergroup_upgrade_is_reported_as_a_migration_not_a_plain_failure()
    {
        using var host = new TestHost();
        GivenChatMigrated(host, -1004294696151);

        var outcome = await CreateSender(host).SendMessageAsync(Message(), CancellationToken.None);

        Assert.False(outcome.Ok);
        Assert.Equal(-1004294696151, outcome.MigrateToChatId);
        // The reason still reaches OutboxMessage.LastError – a handled failure is still
        // a failure, and "why is this message old" must stay answerable.
        Assert.NotNull(outcome.Error);
    }

    // The flip side: an ordinary refusal must not look like a migration, or the loop would
    // repoint the admin chat at 0 and every later card would go nowhere.
    [Fact]
    public async Task An_ordinary_refusal_carries_no_migration_target()
    {
        using var host = new TestHost();
        GivenApiError(host, "Bad Request: chat not found");

        var outcome = await CreateSender(host).SendMessageAsync(Message(), CancellationToken.None);

        Assert.False(outcome.Ok);
        Assert.Null(outcome.MigrateToChatId);
    }

    [Fact]
    public async Task A_keyboard_is_passed_on_as_a_json_object_not_a_string()
    {
        using var host = new TestHost();
        const string keyboard = """
            {"inline_keyboard":[[{"text":"Опубликовать","callback_data":"anon:pub:A7F3K2"}]]}
            """;

        await CreateSender(host).SendMessageAsync(Message(markupJson: keyboard), CancellationToken.None);

        var markup = SentReplyMarkup(host);
        Assert.NotNull(markup);
        // A keyboard that arrives as a quoted string renders as nothing at all.
        Assert.Equal(JsonValueKind.Object, markup!.Value.ValueKind);
        var button = markup.Value.GetProperty("inline_keyboard")[0][0];
        Assert.Equal("Опубликовать", button.GetProperty("text").GetString());
        Assert.Equal("anon:pub:A7F3K2", button.GetProperty("callback_data").GetString());
    }

    [Fact]
    public async Task No_keyboard_means_none_is_sent()
    {
        using var host = new TestHost();

        await CreateSender(host).SendMessageAsync(Message(), CancellationToken.None);

        Assert.Null(SentReplyMarkup(host));
    }

    // DisablePreview is on the port because the outbox depends on it: a moderation card
    // is mostly links, and with previews on one card renders as several. An adapter whose
    // client cannot express this is changing behaviour, and this is where that shows up.
    [Fact]
    public async Task Preview_suppression_is_honoured()
    {
        using var host = new TestHost();

        await CreateSender(host).SendMessageAsync(Message(disablePreview: true), CancellationToken.None);

        Assert.True(SentDisablePreview(host));
    }

    [Fact]
    public async Task A_reply_target_reaches_the_remote_service()
    {
        using var host = new TestHost();

        await CreateSender(host).SendMessageAsync(
            new ChatMessage(-100500, "ссылка", ReplyToMessageId: 50), CancellationToken.None);

        // How each client frames it differs – a flat reply_to_message_id, a nested
        // reply_parameters – so what is pinned here is that the target is not dropped.
        // /paste in the community chat is the whole feature: the link has to land under the
        // wall of text it replaces, not at the bottom of the chat.
        Assert.Contains("50", string.Join(" ", SentFields(host).Values));
    }

    // The other half of it, and the half that is silent when it breaks: an adapter that
    // sends the target but not "send it anyway if the target is gone" turns a reply to a
    // deleted message into no reply at all.
    [Fact]
    public async Task A_reply_survives_a_target_that_has_been_deleted()
    {
        using var host = new TestHost();

        await CreateSender(host).SendMessageAsync(
            new ChatMessage(-100500, "ссылка", ReplyToMessageId: 50), CancellationToken.None);

        Assert.Contains("allow_sending_without_reply", string.Join(" ", SentFields(host).Keys.Concat(SentFields(host).Values)));
    }

    // ── editing a message in place ──────────────────────────────────────────

    // The moderation card settles by being rewritten: buttons off, decision named, in
    // place. An adapter that cannot do this leaves the admin chat with a live keyboard
    // on a request that is already published.
    [Fact]
    public async Task An_edit_reaches_the_message_it_names()
    {
        using var host = new TestHost();

        var outcome = await CreateSender(host).EditMessageTextAsync(
            new ChatEdit(-100500, 4242, "✅ Опубликовано"), CancellationToken.None);

        Assert.True(outcome.Ok);
        Assert.Equal("editMessageText", SentMethod(host));
        var fields = SentFields(host);
        Assert.Equal("-100500", fields["chat_id"]);
        Assert.Equal("4242", fields["message_id"]);
        Assert.Equal("✅ Опубликовано", fields["text"]);
        // A null keyboard means "no buttons", not "leave them alone" – a decided card
        // must not offer a second tap.
        Assert.Null(SentReplyMarkup(host));
    }

    [Fact]
    public async Task An_edit_keeps_a_keyboard_when_one_is_given()
    {
        using var host = new TestHost();
        const string keyboard = """
            {"inline_keyboard":[[{"text":"✅ Опубликовать","callback_data":"anon:pub:A7F3K2"}]]}
            """;

        await CreateSender(host).EditMessageTextAsync(
            new ChatEdit(-100500, 4242, "⚠️ Ошибка публикации", keyboard), CancellationToken.None);

        // The failed-publish card: the reason is written on it and the buttons stay live
        // so the admin can retry after the fix.
        var markup = SentReplyMarkup(host);
        Assert.NotNull(markup);
        Assert.Equal("anon:pub:A7F3K2",
            markup!.Value.GetProperty("inline_keyboard")[0][0].GetProperty("callback_data").GetString());
    }

    [Fact]
    public async Task An_edit_that_is_refused_becomes_a_failed_outcome()
    {
        using var host = new TestHost();
        GivenApiError(host, "Bad Request: message to edit not found");

        var outcome = await CreateSender(host).EditMessageTextAsync(
            new ChatEdit(-100500, 4242, "✅ Опубликовано"), CancellationToken.None);

        // The card is a receipt for a decision already recorded. It failing must stay a
        // returned outcome, or a cosmetic problem becomes a lost publish.
        Assert.False(outcome.Ok);
        Assert.NotNull(outcome.Error);
    }

    // ── polls ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_poll_carries_its_question_and_every_option()
    {
        using var host = new TestHost();
        GivenDelivers(host, 555);

        var outcome = await CreateSender(host).SendPollAsync(
            new ChatPoll(-100500, "🎯 Дилемма недели", ["Посадить рядом джуна", "Попросить написать доку"]),
            CancellationToken.None);

        Assert.True(outcome.Ok);
        // The reveal a day later closes THIS message to read the tally. An adapter that
        // loses the id leaves stopPoll aimed at nothing.
        Assert.Equal(555, outcome.MessageId);
        Assert.Equal("sendPoll", SentMethod(host));

        var fields = SentFields(host);
        Assert.Equal("🎯 Дилемма недели", fields["question"]);
        Assert.Contains("Посадить рядом джуна", OptionLabels(fields["options"]));
        Assert.Contains("Попросить написать доку", OptionLabels(fields["options"]));
    }

    [Fact]
    public async Task A_poll_that_is_refused_becomes_a_failed_outcome()
    {
        using var host = new TestHost();
        GivenApiError(host, "Bad Request: poll must have at least 2 options");

        var outcome = await CreateSender(host).SendPollAsync(
            new ChatPoll(-100500, "?", ["один"]), CancellationToken.None);

        Assert.False(outcome.Ok);
        Assert.Contains("2 options", outcome.Error);
    }

    // ── callback answers ────────────────────────────────────────────────────

    [Fact]
    public async Task A_callback_answer_names_the_query_it_answers()
    {
        using var host = new TestHost();

        var outcome = await CreateSender(host).AnswerCallbackAsync(
            new CallbackAnswer("cb1", "Опубликовано."), CancellationToken.None);

        Assert.True(outcome.Ok);
        Assert.Equal("answerCallbackQuery", SentMethod(host));
        var fields = SentFields(host);
        Assert.Equal("cb1", fields["callback_query_id"]);
        Assert.Equal("Опубликовано.", fields["text"]);
    }

    // Some taps have nothing to say beyond "heard you". The call still has to go out –
    // it is the only thing that stops the spinner on the admin's button.
    [Fact]
    public async Task A_callback_answer_with_nothing_to_say_is_still_sent()
    {
        using var host = new TestHost();

        var outcome = await CreateSender(host).AnswerCallbackAsync(
            new CallbackAnswer("cb1"), CancellationToken.None);

        Assert.True(outcome.Ok);
        Assert.Equal("cb1", SentFields(host)["callback_query_id"]);
    }

    // Nothing waits on this one, so a failure must not escape into the webhook handler
    // and take the whole update down with it.
    [Fact]
    public async Task A_callback_answer_that_is_refused_becomes_a_failed_outcome()
    {
        using var host = new TestHost();
        GivenApiError(host, "Bad Request: query is too old");

        var outcome = await CreateSender(host).AnswerCallbackAsync(
            new CallbackAnswer("cb1", "Опубликовано."), CancellationToken.None);

        Assert.False(outcome.Ok);
        Assert.NotNull(outcome.Error);
    }
}

// The adapter in use today: IChatSender over the hand-rolled TelegramClient, driven
// against a stub socket so the assertions land on real bytes.
public sealed class BotApiChatSenderContractTests : ChatSenderContractTests
{
    protected override IChatSender CreateSender(TestHost host) => host.BotApiSender();

    protected override void GivenDelivers(TestHost host, long messageId) =>
        host.Api.RespondsOk(messageId);

    protected override void GivenApiError(TestHost host, string description) =>
        host.Api.RespondsError(description);

    protected override void GivenTransportFailure(TestHost host, Exception ex) =>
        host.Api.Throws(ex);

    // The real shape of Telegram's answer, ResponseParameters and all.
    protected override void GivenChatMigrated(TestHost host, long newChatId) =>
        host.Api.Responds(System.Net.HttpStatusCode.BadRequest, $$$"""
            {"ok":false,"error_code":400,"description":"Bad Request: group chat was upgraded to a supergroup chat","parameters":{"migrate_to_chat_id":{{{newChatId}}}}}
            """);

    protected override JsonElement? SentReplyMarkup(TestHost host) =>
        host.Api.LastCall.Json.TryGetProperty("reply_markup", out var m) ? m : null;

    protected override bool? SentDisablePreview(TestHost host) =>
        host.Api.LastCall.Bool("disable_web_page_preview");

    // Straight off the JSON body: a string field's own text, anything else as it was
    // written, which matches how Telebot renders its fields.
    protected override IReadOnlyDictionary<string, string> SentFields(TestHost host) =>
        host.Api.LastCall.Json.EnumerateObject().ToDictionary(
            p => p.Name,
            p => p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString()! : p.Value.GetRawText());

    protected override string SentMethod(TestHost host) => host.Api.LastCall.Method;
}
