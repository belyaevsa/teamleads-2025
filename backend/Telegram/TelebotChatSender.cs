using System.Text.Json;
using Telebot;
using Telebot.Models;

namespace TeamleadsBackend.Telegram;

// IChatSender over Bucketlab.Telebot – the adapter PR #12 needs.
//
// Everything that makes this client different from the hand-rolled one is contained
// here. Outbox does not change, and neither does OutboxTests.
public sealed class TelebotChatSender(ITelegramClient client) : IChatSender
{
    public async Task<SendOutcome> SendMessageAsync(ChatMessage message, CancellationToken ct)
    {
        var markup = message.ReplyMarkupJson is null
            ? null
            : JsonSerializer.Deserialize<InlineKeyboardMarkup>(message.ReplyMarkupJson);

        try
        {
            var sent = await client.SendMessageAsync(
                new SendMessageRequestParams(
                    message.ChatId, message.Text,
                    LinkPreviewOptions: PreviewOptions(message.DisablePreview),
                    ReplyMarkup: markup),
                ct);

            return SendOutcome.Delivered(sent.MessageId);
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
    // says. Needs 0.0.6; 0.0.5 had no such field.
    //
    // Every member is filled in on purpose. Telebot 0.0.6 serializes this object without
    // ignoring nulls, so the ones left unset go out as `"url":null` and
    // `"prefer_small_media":null`, and Telegram rejects the whole call with
    // `Bad Request: field "url" must be of type String` – which is how an entire outbox
    // message (a moderation card) burned through its retries and failed for good.
    // Url is empty rather than absent for the same reason: the field is always emitted,
    // and an empty string is the only null-free value that means "no explicit preview
    // target". The three prefer_/show_ flags are false, i.e. Telegram's own defaults, and
    // are moot anyway while is_disabled is true.
    private static LinkPreviewOptions PreviewOptions(bool disabled) => new(
        IsDisabled: disabled,
        Url: "",
        PreferSmallMedia: false,
        PreferLargeMedia: false,
        ShowAboveText: false);
}
