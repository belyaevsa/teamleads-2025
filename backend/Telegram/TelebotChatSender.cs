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
            // Passing LinkPreviewOptions is what actually suppresses previews – reading
            // the field back in a test does not. Telebot only emits link_preview_options
            // when this argument is non-null, so leaving it off means previews stay on
            // no matter what DisablePreview says. Needs 0.0.6; 0.0.5 had no such field.
            var sent = await client.SendMessageAsync(
                new SendMessageRequestParams(
                    message.ChatId, message.Text,
                    LinkPreviewOptions: new LinkPreviewOptions(IsDisabled: message.DisablePreview),
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
            return SendOutcome.Failed(ex.Message);
        }
    }
}
