---
title: "Новый paste"
description: "Поделитесь кодом, логом или конфигом ссылкой"
layout: "paste"
aliases:
  - /pastebin/
  - /p/
---

<div class="paste-page" data-paste-page>
  <h2 class="paste-page-title">Новый paste</h2>
  <p class="paste-page-sub">
    Вставьте код, конфиг или лог — получите короткую ссылку, которой можно поделиться в чате.
    <strong>Подсветка синтаксиса</strong> определяется автоматически.
  </p>

  <form class="paste-form" data-paste-form>
    <label class="paste-label" for="paste-content">Содержимое</label>
    <textarea
      id="paste-content"
      class="paste-textarea"
      placeholder="Вставьте код, YAML, JSON, SQL, лог, конфиг или любой текст длиной от 10 до 64 000 символов…"
      rows="16"
      required
      data-paste-textarea
    ></textarea>
    <div class="paste-char-count" data-paste-count>0 / 64 000</div>

    <!-- Honeypot: screen-reader-only, must stay empty -->
    <div style="position:absolute;left:-9999px" aria-hidden="true">
      <label for="website">Website</label>
      <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
    </div>

    <button type="submit" class="paste-submit" data-paste-submit>
      Создать paste
    </button>
    <span class="paste-error" data-paste-error></span>
  </form>

  <div class="paste-result" hidden data-paste-result>
    <p class="paste-result-label">Paste создан:</p>
    <div class="paste-result-url">
      <input type="text" class="paste-url-input" readonly data-paste-url>
      <button class="paste-copy-btn" data-paste-copy>Copy</button>
    </div>
    <p class="paste-result-raw"><a href="" data-paste-raw>Raw-версия</a></p>
  </div>

  <details class="paste-instructions">
    <summary>Как ещё создать paste?</summary>
    <ul>
      <li><strong>Через бота в Telegram:</strong> напишите <code>/paste ваш код</code> в личку <a href="https://t.me/temlead_helper_bot">@temlead_helper_bot</a>. Бот также сам предложит создать paste, если вы пришлёте ему длинный фрагмент кода.</li>
      <li><strong>Через инлайн-поиск:</strong> искать материалы архива можно прямо из любого чата, набрав <code>@temlead_helper_bot ключевое слово</code>.</li>
      <li><strong>В терминале:</strong> откройте <a href="/shell/">шелл-режим</a>, напишите текст в редакторе и выполните <code>nano --share</code>.</li>
    </ul>
    <br>
    <p>Paste остаётся доступным 30 дней (если создан через сайт) или 7 дней (если создан через бота).</p>
    <p>Создавая paste через эту форму, вы остаётесь анонимным. При создании через бота будет видно ваше имя в Telegram.</p>
  </details>
</div>
