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
            // NOTE: message.DisablePreview cannot be honoured. SendMessageRequestParams
            // has no preview field – its GetRequestFields emits chat_id, text,
            // message_thread_id, parse_mode, disable_notification, protect_content,
            // reply_parameters and reply_markup, and nothing else. Every message sent
            // through this adapter renders with link previews on.
            var sent = await client.SendMessageAsync(
                new SendMessageRequestParams(message.ChatId, message.Text, ReplyMarkup: markup), ct);

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
