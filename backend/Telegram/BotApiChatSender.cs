using System.Text.Json;

namespace TeamleadsBackend.Telegram;

// IChatSender over the hand-rolled TelegramClient.
//
// Not what runs in production any more – Program.cs registers TelebotChatSender – but
// kept, wired and tested on purpose. It is the reference implementation of the port: the
// contract suite runs against both adapters, so "the package behaves the same" is a
// check rather than a claim, and TelegramClientWireTests keeps pinning the exact bytes a
// client has to reproduce. It is also the fallback if the package has to be backed out.
public sealed class BotApiChatSender(TelegramClient tg) : IChatSender
{
    public async Task<SendOutcome> SendMessageAsync(ChatMessage message, CancellationToken ct) =>
        Outcome(await tg.SendMessageAsync(
            message.ChatId, message.Text, Markup(message.ReplyMarkupJson),
            replyToMessageId: message.ReplyToMessageId,
            disablePreview: message.DisablePreview, ct: ct));

    public async Task<SendOutcome> EditMessageTextAsync(ChatEdit edit, CancellationToken ct) =>
        Outcome(await tg.EditMessageTextAsync(
            edit.ChatId, edit.MessageId, edit.Text, Markup(edit.ReplyMarkupJson), ct));

    public async Task<SendOutcome> SendPollAsync(ChatPoll poll, CancellationToken ct) =>
        Outcome(await tg.SendPollAsync(poll.ChatId, poll.Question, poll.Options, ct: ct));

    public async Task<SendOutcome> AnswerCallbackAsync(CallbackAnswer answer, CancellationToken ct) =>
        Outcome(await tg.AnswerCallbackQueryAsync(answer.CallbackQueryId, answer.Text, ct));

    public async Task<PollOutcome> StopPollAsync(ChatPollStop stop, CancellationToken ct) =>
        await tg.StopPollAsync(stop.ChatId, stop.MessageId, ct) is { } votes
            ? PollOutcome.Closed(votes)
            // The hand-rolled client flattens every stopPoll failure to a null tally and
            // keeps no reason – that is its shape, pinned in TelegramClientWireTests, and
            // it is why the reveal treats a missing tally as "publish without the numbers"
            // rather than as something to retry on.
            : PollOutcome.Failed("stopPoll вернул пустой результат");

    // The stored JSON round-trips through JsonElement back to the same JSON it was
    // serialized from, so the keyboard survives the queue byte for byte.
    private static object? Markup(string? json) =>
        json is null ? null : JsonSerializer.Deserialize<JsonElement>(json);

    private static SendOutcome Outcome(TelegramClient.Result result)
    {
        if (result.Ok) return SendOutcome.Delivered(result.MessageId);

        // The client already pulled parameters.migrate_to_chat_id off the response body.
        return result.MigrateToChatId is { } newChatId
            ? SendOutcome.Migrated(newChatId, result.Error ?? "chat was upgraded to a supergroup")
            : SendOutcome.Failed(result.Error ?? "unknown");
    }
}
