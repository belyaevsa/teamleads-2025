using System.Text.Json;
using System.Text.Json.Serialization;
using TeamleadsBackend.Data;
using TeamleadsBackend.Tests.Support;
using Xunit;

namespace TeamleadsBackend.Tests;

// Every Telegram call the webhook makes, driven by a real update over HTTP.
//
// This is the biggest consumer of the client – sendMessage in eight shapes,
// answerCallbackQuery, answerInlineQuery – and the only one where the calls are made
// from private statics with no seam to fake. So the update goes in over the socket and
// the assertions land on what came out the other side.
//
// Two rules hold across the whole file and are asserted again and again on purpose:
// every path answers 200 (a non-200 makes Telegram redeliver the same update forever),
// and no path ever sets parse_mode (someone else's text is never markup).
public class TelegramWebhookTests
{
    private const long Admin = -100777;
    private const long Community = -1001234567890;
    private const long Dm = 424242;

    private static async Task<WebhookHost> StartAsync(
        TestHost? host = null, string searchIndex = "[]", params (string, string)[] config)
    {
        host ??= new TestHost();
        await host.SetSettingAsync("tg.admin_chat_id", Admin.ToString());
        await host.SetSettingAsync("tg.community_chat_id", Community.ToString());
        return await WebhookHost.StartAsync(host, searchIndex, config);
    }

    // ── update shapes ───────────────────────────────────────────────────────
    // Only the fields the handlers read. Telegram sends far more; anything unknown is
    // ignored, which is itself part of why these tests can stay this short.

    private static readonly JsonSerializerOptions Json =
        new() { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private static string Update(object payload) => JsonSerializer.Serialize(payload, Json);

    private static string Message(string? text, long chatId = Dm, string chatType = "private",
        long messageId = 100, long fromId = 999, string? caption = null, object? replyTo = null) =>
        Update(new { message = MessageBody(text, chatId, chatType, messageId, fromId, caption, replyTo) });

    private static object MessageBody(string? text, long chatId = Dm, string chatType = "private",
        long messageId = 100, long fromId = 999, string? caption = null, object? replyTo = null,
        string firstName = "Айгуль", string lastName = "Н") => new
        {
            message_id = messageId,
            chat = new { id = chatId, type = chatType },
            from = new { id = fromId, first_name = firstName, last_name = lastName },
            text,
            caption,
            reply_to_message = replyTo,
        };

    private static object RepliedMessage(string text, long messageId = 50, long fromId = 555) =>
        MessageBody(text, Community, "supergroup", messageId, fromId, firstName: "Ержан", lastName: "");

    private static string Callback(string data, long chatId = Admin, string id = "cb1", long fromId = 555) =>
        Update(new
        {
            callback_query = new
            {
                id,
                from = new { id = fromId, first_name = "Админ" },
                data,
                message = MessageBody("card", chatId, "supergroup", messageId: 4242),
            },
        });

    private static string Inline(string query, string id = "iq1") =>
        Update(new { inline_query = new { id, from = new { id = 999L, first_name = "Айгуль" }, query } });

    // ── the gates ───────────────────────────────────────────────────────────

    [Fact]
    public async Task A_wrong_path_secret_is_a_404_and_calls_nothing()
    {
        await using var web = await StartAsync();

        Assert.Equal(404, await web.PostAsync(Message("/id"), pathSecret: "wrong"));
        Assert.Empty(web.Api.Calls);
    }

    // The path segment leaks through logs and proxies; the header never does. Both are
    // required, so a leaked url on its own grants nothing.
    [Fact]
    public async Task A_wrong_header_token_is_a_404_and_calls_nothing()
    {
        await using var web = await StartAsync();

        Assert.Equal(404, await web.PostAsync(Message("/id"), headerToken: "wrong"));
        Assert.Empty(web.Api.Calls);
    }

    [Fact]
    public async Task An_unconfigured_bot_serves_no_webhook_at_all()
    {
        await using var web = await StartAsync(new TestHost(botToken: null));

        Assert.Equal(404, await web.PostAsync(Message("/id")));
        Assert.Empty(web.Api.Calls);
    }

    // A 500 here would have Telegram redeliver this update forever, so garbage in has
    // to be 200 out. Same for an update carrying nothing we handle.
    [Theory]
    [InlineData("not json at all")]
    [InlineData("""{"update_id":1}""")]
    [InlineData("""{"message":{"message_id":1,"chat":{"id":1,"type":"private"},"date":1}}""")]
    public async Task An_update_we_cannot_act_on_is_answered_200_and_silently(string body)
    {
        await using var web = await StartAsync();

        Assert.Equal(200, await web.PostAsync(body));
        Assert.Empty(web.Api.Calls);
    }

    // ── /id ─────────────────────────────────────────────────────────────────

    // The bootstrap helper: answered in any chat, because configuring tg.admin_chat_id
    // otherwise means guessing whether a group is -id or -100id, and a wrong guess fails
    // as an indistinguishable "chat not found".
    [Fact]
    public async Task Id_answers_in_the_chat_it_was_called_from()
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message("/id", chatId: Community, chatType: "supergroup"));

        var call = Assert.Single(web.Api.Calls);
        Assert.Equal("sendMessage", call.Method);
        Assert.Equal(Community, call.Long("chat_id"));
        Assert.Contains($"chat_id: {Community}", call.String("text"));
        Assert.False(call.Has("parse_mode"));
    }

    // ── DM conversation ─────────────────────────────────────────────────────

    [Theory]
    [InlineData("/start")]
    [InlineData("/help")]
    public async Task Start_and_help_send_the_same_explanation(string command)
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message(command));

        var call = Assert.Single(web.Api.Calls);
        Assert.Equal(Dm, call.Long("chat_id"));
        Assert.Contains("Я Падаван", call.String("text"));
        // The text is full of urls and @mentions. Previews stay off or the help message
        // renders as a stack of cards.
        Assert.True(call.Bool("disable_web_page_preview"));
    }

    [Fact]
    public async Task An_unknown_command_gets_no_answer_at_all()
    {
        await using var web = await StartAsync();

        Assert.Equal(200, await web.PostAsync(Message("/whoami")));
        Assert.Empty(web.Api.Calls);
    }

    // Privacy mode means the bot is handed group messages but has no business in them.
    [Fact]
    public async Task An_ordinary_group_message_gets_no_answer()
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message("просто сообщение в чате", chatId: Community, chatType: "supergroup"));

        Assert.Empty(web.Api.Calls);
    }

    [Fact]
    public async Task A_question_is_acknowledged_with_its_ticket_number_and_the_card_is_queued()
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message("Как убедить бизнес дать время на техдолг, если релиз горит?"));

        var reply = Assert.Single(web.Api.Calls);
        Assert.Equal("sendMessage", reply.Method);
        Assert.Equal(Dm, reply.Long("chat_id"));

        var row = Assert.Single(web.Host.NewDbContext().AnonRequests);
        Assert.Equal("bot", row.Source);
        Assert.Contains(row.PublicId, reply.String("text"));
        Assert.Contains($"/status {row.PublicId}", reply.String("text"));

        // The moderation card is queued, not sent: the webhook must answer Telegram fast,
        // and a card is worth delivering however late. Exactly one call went out.
        var queued = Assert.Single(web.Host.NewDbContext().Outbox);
        Assert.Equal("anon_card", queued.Kind);
    }

    [Fact]
    public async Task A_question_too_short_to_answer_is_refused_and_never_stored()
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message("почему так?"));

        Assert.Contains("Слишком коротко", web.Api.LastCall.String("text"));
        Assert.Empty(web.Host.NewDbContext().AnonRequests);
    }

    // A wall of code sent to the bot is almost always meant as a paste, not as an
    // anonymous question the chat is supposed to discuss.
    [Fact]
    public async Task A_wall_of_code_is_offered_paste_instead_of_becoming_a_question()
    {
        await using var web = await StartAsync();
        var code = string.Join("\n", Enumerable.Range(0, 12).Select(i =>
            $"  public void Handle{i}(string s) {{ if (s != null) {{ Console.WriteLine($\"{i}: {{s}}\"); }} }}"));

        await web.PostAsync(Message(code));

        Assert.Contains("Похоже на код", web.Api.LastCall.String("text"));
        Assert.Empty(web.Host.NewDbContext().AnonRequests);
    }

    // An attachment with a caption and no command. The caption is usable, the file is
    // not – and in a DM going quiet reads as a broken bot.
    [Fact]
    public async Task An_attachment_with_a_caption_gets_a_threaded_answer()
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message(text: null, caption: "лог из продакшена, посмотрите", messageId: 100));

        var call = Assert.Single(web.Api.Calls);
        Assert.Contains("Файл я сохранить не могу", call.String("text"));
        // Threaded under the file, so it is obvious which message the bot is talking about.
        Assert.Equal(100, call.Long("reply_to_message_id"));
        Assert.True(call.Bool("allow_sending_without_reply"));
    }

    // The flood guard is silent by design: telling someone they were throttled just
    // invites them to rotate identity. So the reply is the ordinary one and the only
    // observable difference is that no card was queued.
    [Fact]
    public async Task A_flooder_gets_the_usual_answer_and_no_new_card()
    {
        var host = new TestHost();
        await using var web = await StartAsync(host, config: ("IP_HASH_SALT", "test-salt"));
        await host.SetSettingAsync("anon.max_pending_per_author", "1");

        var text = "Как выстроить онбординг, когда команда растет быстрее, чем документация?";
        await web.PostAsync(Message(text));
        await web.PostAsync(Message(text + " Второй раз, тот же автор."));

        Assert.Equal(2, web.Api.Calls.Count);
        Assert.All(web.Api.Calls, c => Assert.Contains("Принято", c.String("text")));
        Assert.Single(web.Host.NewDbContext().Outbox);
        Assert.Single(web.Host.NewDbContext().AnonRequests);
    }

    // ── /status ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Status_reports_what_happened_to_a_ticket()
    {
        var host = new TestHost();
        host.Db.AnonRequests.Add(new AnonRequest { PublicId = "A7F3K2", Text = "…", Status = "published" });
        await host.Db.SaveChangesAsync();
        await using var web = await StartAsync(host);

        // Lowercase on purpose: people retype the id from memory.
        await web.PostAsync(Message("/status a7f3k2"));

        Assert.Equal("Запрос A7F3K2: опубликовано.", web.Api.LastCall.String("text"));
    }

    [Theory]
    [InlineData("/status", "Формат: /status")]
    [InlineData("/status ZZZZZZ", "не найден")]
    public async Task Status_without_a_usable_ticket_says_so(string command, string expected)
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message(command));

        Assert.Contains(expected, web.Api.LastCall.String("text"));
    }

    // ── /search and inline ──────────────────────────────────────────────────

    private const string Index = """
        [{"u":"/events/tnk-12/","n":"tnk-12","t":"Тимлид не кодит #12","s":"events",
          "b":"Разбирали онбординг и базовый бас-фактор в команде из пяти человек."}]
        """;

    [Fact]
    public async Task Search_in_a_dm_answers_with_the_hits_and_their_urls()
    {
        await using var web = await StartAsync(searchIndex: Index);

        await web.PostAsync(Message("/search онбординг"));

        var call = Assert.Single(web.Api.Calls);
        var text = call.String("text")!;
        Assert.Contains("Тимлид не кодит #12", text);
        Assert.Contains("https://teamleads.kz/events/tnk-12/", text);
        // Snippets are raw article prose and will eventually hold a stray _ or *.
        Assert.False(call.Has("parse_mode"));
    }

    [Theory]
    [InlineData("/search", "Укажите ключевые слова")]
    [InlineData("/find кубернетес", "ничего не найдено")]
    public async Task Search_with_nothing_to_show_still_answers(string command, string expected)
    {
        await using var web = await StartAsync(searchIndex: Index);

        await web.PostAsync(Message(command));

        Assert.Contains(expected, web.Api.LastCall.String("text"));
    }

    // Nothing typed yet. cache_time 0 because the next keystroke must re-query rather
    // than reuse this answer.
    [Fact]
    public async Task An_empty_inline_query_answers_with_the_prompt_button_and_no_cache()
    {
        await using var web = await StartAsync(searchIndex: Index);

        await web.PostAsync(Inline("  "));

        var call = Assert.Single(web.Api.Calls);
        Assert.Equal("answerInlineQuery", call.Method);
        Assert.Equal("iq1", call.String("inline_query_id"));
        Assert.Equal(0, call.Long("cache_time"));
        Assert.Empty(call.Json.GetProperty("results").EnumerateArray());
        Assert.Contains("Поиск по архиву", call.Json.GetProperty("button").GetProperty("text").GetString());
    }

    [Fact]
    public async Task An_inline_query_with_hits_answers_with_article_results()
    {
        await using var web = await StartAsync(searchIndex: Index);

        await web.PostAsync(Inline("онбординг"));

        var call = Assert.Single(web.Api.Calls);
        Assert.Equal("answerInlineQuery", call.Method);
        var result = call.Json.GetProperty("results")[0];
        Assert.Equal("article", result.GetProperty("type").GetString());
        Assert.Contains("Тимлид не кодит #12", result.GetProperty("title").GetString());
        // What actually gets sent into the chat when the result is picked. The preview is
        // wanted here – the card is the point of sharing an archive link.
        var content = result.GetProperty("input_message_content");
        Assert.Contains("https://teamleads.kz/events/tnk-12/", content.GetProperty("message_text").GetString());
        Assert.False(content.GetProperty("disable_web_page_preview").GetBoolean());
    }

    // An empty result list renders as an empty popup, which reads as a broken bot. One
    // card plus a button into the bot: "не нашлось" is exactly when someone should be
    // asking the chat instead.
    [Fact]
    public async Task An_inline_query_with_no_hits_still_answers_with_a_card()
    {
        await using var web = await StartAsync(searchIndex: Index);

        await web.PostAsync(Inline("кубернетес"));

        var call = Assert.Single(web.Api.Calls);
        var results = call.Json.GetProperty("results");
        Assert.Equal(1, results.GetArrayLength());
        Assert.Contains("Ничего не найдено", results[0].GetProperty("title").GetString());
        Assert.Contains("Спросите чат анонимно", call.Json.GetProperty("button").GetProperty("text").GetString());
    }

    // ── moderation buttons ──────────────────────────────────────────────────

    private static async Task<TestHost> WithPendingRequestAsync()
    {
        var host = new TestHost();
        host.Db.AnonRequests.Add(new AnonRequest
        {
            PublicId = "A7F3K2",
            Text = "Как убедить бизнес дать время на техдолг?",
            Status = "pending",
            AdminMessageId = 4242,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await host.Db.SaveChangesAsync();
        return host;
    }

    [Fact]
    public async Task Publish_posts_the_question_settles_the_card_and_stops_the_spinner()
    {
        await using var web = await StartAsync(await WithPendingRequestAsync());
        web.Api.RespondsOk(messageId: 9001);   // sendMessage to the community chat
        web.Api.RespondsOk();                  // editMessageText on the card
        web.Api.RespondsOk();                  // answerCallbackQuery

        Assert.Equal(200, await web.PostAsync(Callback("anon:pub:A7F3K2")));

        Assert.Equal(["sendMessage", "editMessageText", "answerCallbackQuery"],
            web.Api.Calls.Select(c => c.Method));

        // The spinner keeps turning until this call lands, and the admin taps again.
        var ack = web.Api.Calls[2];
        Assert.Equal("cb1", ack.String("callback_query_id"));
        Assert.Equal("Опубликовано.", ack.String("text"));

        var row = web.Host.NewDbContext().AnonRequests.Single();
        Assert.Equal("published", row.Status);
        Assert.Equal(555, row.ModeratedByTgId);   // admins are not anonymous
    }

    [Fact]
    public async Task Reject_settles_the_card_without_touching_the_community_chat()
    {
        await using var web = await StartAsync(await WithPendingRequestAsync());

        await web.PostAsync(Callback("anon:rej:A7F3K2"));

        Assert.Equal(["editMessageText", "answerCallbackQuery"], web.Api.Calls.Select(c => c.Method));
        Assert.Equal("Отклонено.", web.Api.LastCall.String("text"));
    }

    // Callback data is attacker-controllable in general, so the chat the button was
    // pressed in is the real gate – not the payload.
    [Fact]
    public async Task A_button_pressed_outside_the_admin_chat_only_gets_a_refusal()
    {
        await using var web = await StartAsync(await WithPendingRequestAsync());

        await web.PostAsync(Callback("anon:pub:A7F3K2", chatId: Community));

        var call = Assert.Single(web.Api.Calls);
        Assert.Equal("answerCallbackQuery", call.Method);
        Assert.Equal("Недоступно.", call.String("text"));
        Assert.Equal("pending", web.Host.NewDbContext().AnonRequests.Single().Status);
    }

    [Theory]
    [InlineData("garbage", null)]                      // unrecognised shape: acknowledged, nothing said
    [InlineData("anon:pub:NOPE", "Запрос не найден.")]  // right shape, no such request
    public async Task A_callback_that_leads_nowhere_still_stops_the_spinner(string data, string? expected)
    {
        await using var web = await StartAsync(await WithPendingRequestAsync());

        await web.PostAsync(Callback(data));

        var call = Assert.Single(web.Api.Calls);
        Assert.Equal("answerCallbackQuery", call.Method);
        Assert.Equal(expected, call.String("text"));
    }

    // The edit flow carries its state in the prompt text – no "awaiting reply" column,
    // nothing to expire. Which means the prompt's exact shape is load-bearing.
    [Fact]
    public async Task Edit_prompts_in_the_admin_chat_and_the_reply_lands_on_the_request()
    {
        await using var web = await StartAsync(await WithPendingRequestAsync());

        await web.PostAsync(Callback("anon:edit:A7F3K2"));

        var prompt = web.Api.Calls[0];
        Assert.Equal("sendMessage", prompt.Method);
        Assert.Equal(Admin, prompt.Long("chat_id"));
        Assert.StartsWith("✏️ Правка A7F3K2", prompt.String("text"));
        Assert.Equal("Ответьте на сообщение ниже.", web.Api.Calls[1].String("text"));

        // Now the admin replies to that prompt with the rewritten text.
        web.Api.Calls.Clear();
        await web.PostAsync(Message("обезличенная версия вопроса", chatId: Admin, chatType: "supergroup",
            replyTo: MessageBody(prompt.String("text"), Admin, "supergroup", messageId: 4243)));

        Assert.Equal(["editMessageText", "sendMessage"], web.Api.Calls.Select(c => c.Method));
        Assert.Contains("обезличенная версия вопроса", web.Api.Calls[0].String("text"));
        Assert.Equal("обезличенная версия вопроса", web.Host.NewDbContext().AnonRequests.Single().EditedText);
    }

    // ── admin commands ──────────────────────────────────────────────────────

    [Fact]
    public async Task Set_lists_the_catalog_in_the_admin_chat()
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message("/set", chatId: Admin, chatType: "supergroup"));

        var call = Assert.Single(web.Api.Calls);
        Assert.Equal(Admin, call.Long("chat_id"));
        Assert.Contains("⚙️ Настройки бота", call.String("text"));
        Assert.Contains("tg.admin_chat_id", call.String("text"));
    }

    [Fact]
    public async Task Set_writes_the_value_and_reports_back()
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message("/set tg.scheduler.enabled false", chatId: Admin, chatType: "supergroup"));

        Assert.Contains("✅ tg.scheduler.enabled = false", web.Api.LastCall.String("text"));
        Assert.Equal("false", web.Host.NewDbContext().Settings.Single(s => s.Key == "tg.scheduler.enabled").Value);
    }

    [Fact]
    public async Task A_rejected_setting_is_explained_and_not_written()
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message("/set tg.dilemma.hour полдень", chatId: Admin, chatType: "supergroup"));

        var call = Assert.Single(web.Api.Calls);
        Assert.Contains("tg.dilemma.hour", call.String("text"));
        Assert.DoesNotContain("✅", call.String("text"));
        Assert.DoesNotContain(web.Host.NewDbContext().Settings, s => s.Key == "tg.dilemma.hour");
    }

    // The manual triggers run the same code the scheduler runs, so what an admin tests by
    // hand on Friday is what fires on Monday. The answer goes back to the admin chat.
    [Theory]
    [InlineData("/dilemma")]
    [InlineData("/reveal")]
    [InlineData("/question")]
    public async Task A_manual_trigger_reports_its_outcome_in_the_admin_chat(string command)
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message(command, chatId: Admin, chatType: "supergroup"));

        // The archive stub is empty here, so nothing is posted – what is pinned is that
        // the outcome comes back as one message to the admin chat rather than silence.
        var call = Assert.Single(web.Api.Calls);
        Assert.Equal("sendMessage", call.Method);
        Assert.Equal(Admin, call.Long("chat_id"));
        Assert.False(string.IsNullOrWhiteSpace(call.String("text")));
    }

    // ── /paste ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Paste_in_a_dm_answers_with_a_link_and_leaves_the_preview_on()
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message("/paste SELECT * FROM outbox WHERE status = 'pending';", messageId: 100));

        var call = Assert.Single(web.Api.Calls);
        var paste = web.Host.NewDbContext().Pastes.Single();
        Assert.Contains($"https://teamleads.kz/p/{paste.PublicId}/", call.String("text"));
        // The preview card is where Telegram draws the Instant View button – the single
        // place in this bot where previews are deliberately on.
        Assert.False(call.Bool("disable_web_page_preview"));
        Assert.Equal(100, call.Long("reply_to_message_id"));
        Assert.Equal("bot", paste.Source);
    }

    // The community-chat shape: someone dumps a wall of text, anyone replies "/paste",
    // and the link has to land under the wall – not under the command.
    [Fact]
    public async Task Paste_in_reply_threads_under_the_original_and_keeps_its_author()
    {
        await using var web = await StartAsync();
        var wall = string.Join("\n", Enumerable.Range(0, 20).Select(i => $"2026-08-06 12:00:{i:D2} ERROR timeout"));

        await web.PostAsync(Message("/paste", chatId: Community, chatType: "supergroup", messageId: 100,
            replyTo: RepliedMessage(wall, messageId: 50, fromId: 555)));

        var call = Assert.Single(web.Api.Calls);
        Assert.Equal(Community, call.Long("chat_id"));
        // 50, not 100: authorship and placement both follow the content, not the command.
        Assert.Equal(50, call.Long("reply_to_message_id"));

        var paste = web.Host.NewDbContext().Pastes.Single();
        Assert.Equal(555, paste.AuthorTgId);
        Assert.Equal("Ержан", paste.AuthorName);
        Assert.Contains("автор: Ержан", call.String("text"));
    }

    // Telegram strips reply_to_message from command updates while the bot is in privacy
    // mode, so "ответьте на простыню" silently does nothing in a group. Say that, rather
    // than repeating the hint the user just followed.
    [Fact]
    public async Task Paste_with_nothing_to_paste_explains_why_per_chat_type()
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message("/paste", chatId: Community, chatType: "supergroup", messageId: 100));
        Assert.Contains("до меня не дошел", web.Api.LastCall.String("text"));

        await web.PostAsync(Message("/paste"));
        Assert.Contains("/paste ваш код", web.Api.LastCall.String("text"));

        Assert.Empty(web.Host.NewDbContext().Pastes);
    }

    [Fact]
    public async Task Paste_refuses_a_scrap_of_text_and_stores_nothing()
    {
        await using var web = await StartAsync();

        await web.PostAsync(Message("/paste ok"));

        Assert.Contains("Слишком коротко", web.Api.LastCall.String("text"));
        Assert.Empty(web.Host.NewDbContext().Pastes);
    }

    // With PASTE_IV_RHASH set the url is wrapped so Instant View works before the domain
    // template is approved. It is a stopgap, which is exactly why it needs a test – the
    // day it is cleared, the plain url has to come back.
    [Fact]
    public async Task Paste_wraps_the_link_for_instant_view_when_a_rhash_is_configured()
    {
        await using var web = await StartAsync(config: ("PASTE_IV_RHASH", "abc123"));

        await web.PostAsync(Message("/paste SELECT * FROM outbox WHERE status = 'pending';"));

        var text = web.Api.LastCall.String("text")!;
        Assert.Contains("https://t.me/iv?url=", text);
        Assert.Contains("rhash=abc123", text);
    }

    // ── the outage case ─────────────────────────────────────────────────────

    // Telegram being down must not become a 500: that would have this same update
    // redelivered forever, and every redelivery would create another anon request.
    [Fact]
    public async Task A_dead_bot_api_is_still_answered_200()
    {
        await using var web = await StartAsync();
        web.Api.Throws(new HttpRequestException("Connection refused"));

        Assert.Equal(200, await web.PostAsync(Message("/start")));
        Assert.Single(web.Api.Calls);
    }
}
