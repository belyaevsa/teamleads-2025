using System.Text.Json;
using Telebot;
using Telebot.Models;

namespace TeamleadsBackend.Telegram;

// IChatSender over Bucketlab.Telebot 0.0.72 – the client in use today.
//
// Everything that makes this package different from the hand-rolled client is contained
// here: it signals failure by throwing, it has no typed ResponseParameters, and its
// message ids are 32-bit. Nothing above the port learns any of that.
//
// How the coverage grew: 0.0.6 could do sendMessage alone, which is why every other call
// stayed on TelegramClient. 0.0.7 added editMessageText and answerCallbackQuery, taking the
// moderation card and the button spinner, with sendPoll alongside them. 0.0.72 stopped
// serializing unset members as explicit nulls, which is what made a threaded reply safe to
// send – under 0.0.7 reply_parameters went out with seven nulls in it and Telegram refuses
// a request holding one. What is still out of reach: stopPoll and answerInlineQuery, which
// the package has no method for at all. See IChatSender.
public sealed class TelebotChatSender(ITelegramClient client) : IChatSender
{
    public Task<SendOutcome> SendMessageAsync(ChatMessage message, CancellationToken ct) =>
        CallAsync(async () =>
        {
            var sent = await client.SendMessageAsync(
                new SendMessageRequestParams(
                    message.ChatId, message.Text,
                    LinkPreviewOptions: PreviewOptions(message.DisablePreview),
                    ReplyParameters: ReplyTo(message.ReplyToMessageId),
                    ReplyMarkup: Markup(message.ReplyMarkupJson)),
                ct);
            return sent.MessageId;
        }, ct);

    public Task<SendOutcome> EditMessageTextAsync(ChatEdit edit, CancellationToken ct) =>
        CallAsync(async () =>
        {
            // Message ids are int here and long everywhere else. Telegram's own ids are
            // well inside int range, and a card whose id somehow is not is a card we
            // could not have sent in the first place.
            var edited = await client.EditMessageTextAsync(
                new EditMessageTextRequestParams(
                    edit.ChatId, checked((int)edit.MessageId), edit.Text,
                    ParseMode: null,
                    LinkPreviewOptions: PreviewOptions(true),
                    ReplyMarkup: Markup(edit.ReplyMarkupJson)),
                ct);
            return edited.MessageId;
        }, ct);

    // Telebot's sendPoll takes the chat, the question and the options and nothing else.
    // That is exactly the poll this bot posts: is_anonymous and type default to `true`
    // and `regular` at Telegram's end, which is what the dilemma asked for explicitly
    // before. See ChatPoll – no quiz, no correct answer, by construction.
    public Task<SendOutcome> SendPollAsync(ChatPoll poll, CancellationToken ct) =>
        CallAsync(async () =>
        {
            var sent = await client.SendPollAsync(
                new SendPollRequestParams(
                    poll.ChatId, poll.Question,
                    poll.Options.Select(o => new InputPollOption(o)).ToList()),
                ct);
            return sent.MessageId;
        }, ct);

    // Returns `true`, not a message – there is nothing to carry a message id, and the
    // port's MessageId stays 0 the way it does for the hand-rolled client.
    public Task<SendOutcome> AnswerCallbackAsync(CallbackAnswer answer, CancellationToken ct) =>
        CallAsync(async () =>
        {
            // The three optional members are left unset: since 0.0.72 an unset member is
            // an absent field rather than a null one, so Telegram simply gets its own
            // defaults. A tap with nothing to say sends no text at all – the spinner stops
            // and no toast is shown.
            await client.AnswerCallbackQueryAsync(
                new AnswerCallbackQueryRequestParams(answer.CallbackQueryId, answer.Text,
                    ShowAlert: null, Url: null, CacheTime: null),
                ct);
            return 0;
        }, ct);

    // The one place that turns "this client throws" into "the port returns an outcome".
    // Every method funnels through it so a new one cannot forget to.
    private static async Task<SendOutcome> CallAsync(Func<Task<long>> call, CancellationToken ct)
    {
        try
        {
            return SendOutcome.Delivered(await call());
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Only a genuine shutdown propagates. The `when` clause matters: HttpClient
            // reports its own timeout as TaskCanceledException, which derives from
            // OperationCanceledException, so filtering on the type alone would let a slow
            // Telegram escape into DispatchDueAsync and discard the whole batch. Checking
            // the caller's token is what separates "we are stopping" from "it was slow".
            throw;
        }
        catch (Exception ex)
        {
            // Telebot signals every failure by throwing – protocol errors, HTTP status
            // codes, deserialization problems. The port promises an outcome, so they all
            // become one here.
            return MigrateToChatIdOf(ex.Message) is { } newChatId
                ? SendOutcome.Migrated(newChatId, ex.Message)
                : SendOutcome.Failed(ex.Message);
        }
    }

    private static InlineKeyboardMarkup? Markup(string? json) =>
        json is null ? null : JsonSerializer.Deserialize<InlineKeyboardMarkup>(json);

    // AllowSendingWithoutReply is not optional politeness: the message being replied to may
    // already be deleted, and without it Telegram refuses the send outright – a lost reply
    // target turning into a lost answer.
    //
    // Everything else stays unset. That is only safe from 0.0.72 on; before it, the six
    // unset members went out as explicit nulls and Telegram rejected the whole call, and
    // there is no value for `quote` that would have been a no-op. Hence the sweep in
    // TelebotChatSenderContractTests, which fails the day a version regresses on this.
    private static ReplyParameters? ReplyTo(long? messageId) =>
        messageId is null
            ? null
            : new ReplyParameters(
                MessageId: checked((int)messageId.Value),
                ChatId: null,
                EphemeralMessageId: null,
                AllowSendingWithoutReply: true,
                Quote: null,
                QuoteParseMode: null,
                QuotePosition: null,
                ChecklistTaskId: null,
                PollOptionId: null);

    // Digs parameters.migrate_to_chat_id out of the exception text.
    //
    // Telebot's TelebotException carries only a status code and a message, and the message
    // is the raw response body behind an "HTTP error 400: " prefix – there is no typed
    // ResponseParameters to read. So the body gets parsed back out of the string here.
    //
    // This belongs in the adapter and nowhere else. It is precisely the kind of vendor
    // quirk the port exists to absorb: Outbox acts on SendOutcome.Migrated and never
    // learns that one of its clients communicates by throwing formatted English.
    private static long? MigrateToChatIdOf(string message)
    {
        var start = message.IndexOf('{');
        if (start < 0) return null;

        try
        {
            using var body = JsonDocument.Parse(message[start..]);
            return body.RootElement.TryGetProperty("parameters", out var parameters)
                && parameters.TryGetProperty("migrate_to_chat_id", out var id)
                && id.TryGetInt64(out var value)
                    ? value
                    : null;
        }
        catch (JsonException)
        {
            // The message was not a wrapped response body – a transport error, say.
            // Nothing to migrate to, so it stays an ordinary failure.
            return null;
        }
    }

    // Passing LinkPreviewOptions is what actually suppresses previews – reading the field
    // back in a test does not. Telebot only emits link_preview_options when this argument
    // is non-null, so leaving it off means previews stay on no matter what DisablePreview
    // says.
    //
    // The other four members stay unset, and that is the 0.0.72 upgrade paying for itself.
    // Through 0.0.71 they went out as `"url":null` and `"prefer_small_media":null`, Telegram
    // refused the whole call with `Bad Request: field "url" must be of type String`, and an
    // outbox message – a moderation card – burned through its retries and failed for good.
    // The workaround was to fill every member with a null-free stand-in; 0.0.72 omits unset
    // members instead, so the honest version is back.
    private static LinkPreviewOptions PreviewOptions(bool disabled) => new(
        IsDisabled: disabled,
        Url: null,
        PreferSmallMedia: null,
        PreferLargeMedia: null,
        ShowAboveText: null);
}
