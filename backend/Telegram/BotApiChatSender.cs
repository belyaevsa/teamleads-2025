using System.Text.Json;

namespace TeamleadsBackend.Telegram;

// IChatSender over the hand-rolled TelegramClient – the adapter in use today.
//
// A replacement client gets its own adapter next to this one and a line in Program.cs;
// nothing in Outbox or OutboxTests changes. Both adapters must pass the same contract
// tests (backend.Tests/ChatSenderContractTests.cs), which is where "behaves the same"
// stops being a claim and becomes a check.
public sealed class BotApiChatSender(TelegramClient tg) : IChatSender
{
    public async Task<SendOutcome> SendMessageAsync(ChatMessage message, CancellationToken ct)
    {
        // The stored JSON round-trips through JsonElement back to the same JSON it was
        // serialized from, so the keyboard survives the queue byte for byte.
        object? markup = message.ReplyMarkupJson is null
            ? null
            : JsonSerializer.Deserialize<JsonElement>(message.ReplyMarkupJson);

        var result = await tg.SendMessageAsync(
            message.ChatId, message.Text, markup,
            disablePreview: message.DisablePreview, ct: ct);

        if (result.Ok) return SendOutcome.Delivered(result.MessageId);

        // The client already pulled parameters.migrate_to_chat_id off the response body.
        return result.MigrateToChatId is { } newChatId
            ? SendOutcome.Migrated(newChatId, result.Error ?? "chat was upgraded to a supergroup")
            : SendOutcome.Failed(result.Error ?? "unknown");
    }
}
