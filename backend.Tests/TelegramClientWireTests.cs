using System.Text.Json;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// The contract a replacement Bot API package has to reproduce.
//
// These assert on the JSON that reaches the socket, not on how the client is called.
// A swap that keeps the C# signatures but changes the payload – drops
// allow_sending_without_reply, sends chat_id as a string, defaults parse_mode to
// Markdown – compiles and deploys clean and breaks in production. That is what this
// file exists to stop.
public class TelegramClientWireTests
{
    // ---- routing -----------------------------------------------------------------

    [Fact]
    public async Task Call_targets_the_bot_token_path_with_a_leading_slash()
    {
        using var host = new TestHost(botToken: "8314549598:AAxyz");

        await host.Telegram.SendMessageAsync(1, "hi");

        // A bot token contains a colon. Without the leading slash the relative URI parses
        // as scheme "bot8314549598" and every call dies with "scheme is not supported".
        Assert.Equal("/bot8314549598:AAxyz/sendMessage", host.Api.LastCall.Path);
    }

    [Fact]
    public async Task Call_is_skipped_entirely_when_no_token_is_configured()
    {
        using var host = new TestHost(botToken: null);

        var result = await host.Telegram.SendMessageAsync(1, "hi");

        Assert.False(result.Ok);
        Assert.Equal("TG_BOT_TOKEN is not configured", result.Error);
        Assert.Empty(host.Api.Calls);   // no half-formed request goes out
    }

    // ---- sendMessage -------------------------------------------------------------

    [Fact]
    public async Task SendMessage_never_sets_parse_mode()
    {
        using var host = new TestHost();

        await host.Telegram.SendMessageAsync(-100123, "*not bold* [x](tg://user?id=42)");

        var call = host.Api.LastCall;
        Assert.Equal("sendMessage", call.Method);
        // Deliberate: user input must never be interpreted as markup, or a submitter can
        // smuggle in a hidden tg://user mention and deanonymize themselves.
        Assert.False(call.Has("parse_mode"));
        Assert.Equal("*not bold* [x](tg://user?id=42)", call.String("text"));
        Assert.Equal(-100123, call.Long("chat_id"));
    }

    [Fact]
    public async Task SendMessage_disables_previews_by_default()
    {
        using var host = new TestHost();

        await host.Telegram.SendMessageAsync(1, "https://teamleads.kz https://example.com");

        Assert.True(host.Api.LastCall.Bool("disable_web_page_preview"));
    }

    [Fact]
    public async Task SendMessage_can_opt_back_into_previews()
    {
        using var host = new TestHost();

        // /paste relies on this: the preview is where Telegram draws the Instant View button.
        await host.Telegram.SendMessageAsync(1, "https://teamleads.kz/p/ABC", disablePreview: false);

        Assert.False(host.Api.LastCall.Bool("disable_web_page_preview"));
    }

    [Fact]
    public async Task SendMessage_omits_reply_fields_when_not_threading()
    {
        using var host = new TestHost();

        await host.Telegram.SendMessageAsync(1, "hi");

        var call = host.Api.LastCall;
        Assert.False(call.Has("reply_to_message_id"));
        Assert.False(call.Has("allow_sending_without_reply"));
        Assert.False(call.Has("reply_markup"));
    }

    [Fact]
    public async Task SendMessage_threading_always_allows_a_missing_reply_target()
    {
        using var host = new TestHost();

        await host.Telegram.SendMessageAsync(1, "hi", replyToMessageId: 555);

        var call = host.Api.LastCall;
        Assert.Equal(555, call.Long("reply_to_message_id"));
        // The original may already be deleted. A lost reply target must not turn into a
        // lost answer – without this, /paste silently drops replies to deleted messages.
        Assert.True(call.Bool("allow_sending_without_reply"));
    }

    [Fact]
    public async Task SendMessage_sends_reply_markup_as_a_json_object_not_a_string()
    {
        using var host = new TestHost();
        var keyboard = new
        {
            inline_keyboard = new[] { new[] { new { text = "Опубликовать", callback_data = "anon:pub:A7F3K2" } } },
        };

        await host.Telegram.SendMessageAsync(1, "card", keyboard);

        var markup = host.Api.LastCall.Json.GetProperty("reply_markup");
        Assert.Equal(JsonValueKind.Object, markup.ValueKind);
        var button = markup.GetProperty("inline_keyboard")[0][0];
        Assert.Equal("Опубликовать", button.GetProperty("text").GetString());
        Assert.Equal("anon:pub:A7F3K2", button.GetProperty("callback_data").GetString());
    }

    [Fact]
    public async Task Payload_uses_snake_case_property_names()
    {
        using var host = new TestHost();

        await host.Telegram.EditMessageTextAsync(1, 2, "edited");

        var call = host.Api.LastCall;
        Assert.Equal("editMessageText", call.Method);
        Assert.True(call.Has("message_id"));
        Assert.False(call.Has("messageId"));
        Assert.Equal(2, call.Long("message_id"));
        Assert.True(call.Bool("disable_web_page_preview"));
    }

    // ---- polls -------------------------------------------------------------------

    [Fact]
    public async Task SendPoll_without_a_correct_option_is_a_regular_anonymous_poll()
    {
        using var host = new TestHost();

        await host.Telegram.SendPollAsync(-100, "Ваш выбор?", ["А", "Б", "В"]);

        var call = host.Api.LastCall;
        Assert.Equal("sendPoll", call.Method);
        Assert.Equal("regular", call.String("type"));
        // An anonymous vote is exactly what someone who won't type in front of their boss
        // will still do. A dilemma has no "correct" answer, so it must not become a quiz.
        Assert.True(call.Bool("is_anonymous"));
        Assert.False(call.Has("correct_option_id"));
        Assert.False(call.Has("explanation"));
        Assert.Equal(3, call.Json.GetProperty("options").GetArrayLength());
    }

    [Fact]
    public async Task SendPoll_with_a_correct_option_becomes_a_quiz()
    {
        using var host = new TestHost();

        await host.Telegram.SendPollAsync(-100, "Вопрос?", ["А", "Б"], correctOptionId: 1, explanation: "потому что");

        var call = host.Api.LastCall;
        Assert.Equal("quiz", call.String("type"));
        Assert.Equal(1, call.Long("correct_option_id"));
        Assert.Equal("потому что", call.String("explanation"));
    }

    [Fact]
    public async Task SendPoll_keeps_correct_option_zero_rather_than_dropping_it_as_a_default()
    {
        using var host = new TestHost();

        // 0 is a legitimate answer index. A client that treats it as "unset" turns the
        // first option into a plain poll and silently loses the quiz.
        await host.Telegram.SendPollAsync(-100, "Вопрос?", ["А", "Б"], correctOptionId: 0);

        var call = host.Api.LastCall;
        Assert.Equal("quiz", call.String("type"));
        Assert.Equal(0, call.Long("correct_option_id"));
    }

    [Fact]
    public async Task StopPoll_returns_voter_counts_in_option_order()
    {
        using var host = new TestHost();
        host.Api.RespondsOk(rawResult: """
            {"id":"1","options":[
                {"text":"А","voter_count":7},
                {"text":"Б","voter_count":0},
                {"text":"В","voter_count":12}]}
            """);

        var votes = await host.Telegram.StopPollAsync(-100, 42);

        Assert.Equal<IEnumerable<int>>([7, 0, 12], votes!);
        Assert.Equal("stopPoll", host.Api.LastCall.Method);
    }

    [Fact]
    public async Task StopPoll_returns_null_when_the_poll_is_already_closed()
    {
        using var host = new TestHost();
        host.Api.RespondsError("Bad Request: poll has already been closed");

        // null, not an empty array: the reveal must be able to tell "no votes" from
        // "we never learned the votes".
        Assert.Null(await host.Telegram.StopPollAsync(-100, 42));
    }

    [Fact]
    public async Task StopPoll_treats_an_option_without_a_count_as_zero()
    {
        using var host = new TestHost();
        host.Api.RespondsOk(rawResult: """{"options":[{"text":"А"},{"text":"Б","voter_count":3}]}""");

        var votes = await host.Telegram.StopPollAsync(-100, 42);

        Assert.Equal<IEnumerable<int>>([0, 3], votes!);
    }

    // ---- inline + webhook --------------------------------------------------------

    [Fact]
    public async Task AnswerInlineQuery_passes_the_results_button_through()
    {
        using var host = new TestHost();

        await host.Telegram.AnswerInlineQueryAsync("q1", [], cacheTime: 0,
            button: new { text = "Ничего не найдено", start_parameter = "help" });

        var call = host.Api.LastCall;
        Assert.Equal("answerInlineQuery", call.Method);
        Assert.Equal("q1", call.String("inline_query_id"));
        Assert.Equal(0, call.Long("cache_time"));
        // The only way to say anything when there are no results – an empty list renders
        // as an empty popup, which reads as a broken bot.
        Assert.Equal("Ничего не найдено", call.Json.GetProperty("button").GetProperty("text").GetString());
    }

    [Fact]
    public async Task AnswerCallbackQuery_omits_text_when_none_is_given()
    {
        using var host = new TestHost();

        await host.Telegram.AnswerCallbackQueryAsync("cb1");

        var call = host.Api.LastCall;
        Assert.Equal("answerCallbackQuery", call.Method);
        Assert.Equal("cb1", call.String("callback_query_id"));
        Assert.False(call.Has("text"));   // null is dropped, not sent as JSON null
    }

    [Fact]
    public async Task SetWebhook_subscribes_to_exactly_the_three_update_kinds_handled()
    {
        using var host = new TestHost();

        await host.Telegram.SetWebhookAsync("https://teamleads.kz/api/tg/webhook/s3cret", "s3cret");

        var call = host.Api.LastCall;
        var updates = call.Json.GetProperty("allowed_updates").EnumerateArray().Select(u => u.GetString()).ToArray();
        Assert.Equal<IEnumerable<string?>>(["message", "callback_query", "inline_query"], updates);
        Assert.Equal("s3cret", call.String("secret_token"));
        Assert.True(call.Bool("drop_pending_updates"));
    }

    // ---- result mapping ----------------------------------------------------------

    [Fact]
    public async Task Success_carries_the_message_id_out_of_the_result()
    {
        using var host = new TestHost();
        host.Api.RespondsOk(messageId: 61217);

        var result = await host.Telegram.SendMessageAsync(1, "hi");

        Assert.True(result.Ok);
        Assert.Equal(61217, result.MessageId);
        Assert.Null(result.Error);
    }

    [Fact]
    public async Task Success_without_a_message_in_the_result_is_still_ok()
    {
        using var host = new TestHost();
        host.Api.RespondsOk();   // answerCallbackQuery/setWebhook return `result: true`

        var result = await host.Telegram.AnswerCallbackQueryAsync("cb1");

        Assert.True(result.Ok);
        Assert.Equal(0, result.MessageId);
    }

    [Fact]
    public async Task Api_error_surfaces_telegrams_description_verbatim()
    {
        using var host = new TestHost();
        host.Api.RespondsError("Forbidden: bot was kicked from the supergroup chat");

        var result = await host.Telegram.SendMessageAsync(1, "hi");

        Assert.False(result.Ok);
        // The description is what the admin sees on the "ошибка публикации" card, and
        // what Outbox stores in LastError. Losing it turns every failure into "unknown".
        Assert.Equal("Forbidden: bot was kicked from the supergroup chat", result.Error);
    }

    [Fact]
    public async Task Transport_failure_is_returned_not_thrown()
    {
        using var host = new TestHost();
        host.Api.Throws(new HttpRequestException("Connection refused"));

        // A Telegram outage is an expected condition here – it becomes a retryable outbox
        // attempt, never a 500 on the webhook.
        var result = await host.Telegram.SendMessageAsync(1, "hi");

        Assert.False(result.Ok);
        Assert.Contains("Connection refused", result.Error);
    }

    [Fact]
    public async Task Non_json_response_is_returned_not_thrown()
    {
        using var host = new TestHost();
        host.Api.RespondsGarbage();   // an nginx error page in front of the API

        var result = await host.Telegram.SendMessageAsync(1, "hi");

        Assert.False(result.Ok);
        Assert.NotNull(result.Error);
    }

    // BEHAVIOUR THE REPLACEMENT CHANGES – see OutboxTests.Cancellation_during_a_send.
    // The catch-all in CallJsonAsync swallows OperationCanceledException too, so a
    // cancelled send comes back as an ordinary failed Result and Outbox burns a retry
    // attempt on it. PR #12 makes cancellation propagate instead. That is arguably the
    // better behaviour, but it is a change, and this test is here so the swap is a
    // decision rather than a side effect.
    [Fact]
    public async Task Cancellation_is_currently_swallowed_into_a_failed_result()
    {
        using var host = new TestHost();
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        var result = await host.Telegram.SendMessageAsync(1, "hi", ct: cts.Token);

        Assert.False(result.Ok);
    }
}
