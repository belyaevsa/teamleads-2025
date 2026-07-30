/*!
 * Context Ask – выделил кусок текста, спросил в чат. Вопрос уходит в тот же
 * POST /api/anon, что форма и терминал, с source=context. Оформление берет
 * оверлей Claude-чата (.cl-overlay/.cl-panel/...), стили живут в main.css.
 */
(function () {
    // Тег стоит с defer, так что body уже есть. Ветка – на случай переезда в <head>.
    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init, { once: true });

    function init() {
        if (window.__tlContextAskLoaded) return;
        window.__tlContextAskLoaded = true;

        // Все контейнеры с текстом: статьи, инсайты, встречи, тулкит, зарплаты,
        // вопросы. Шаблоны заворачивают контент в .report-content, статьи и тулкит –
        // дополнительно в .article-body. Своя разметка включается data-context-ask.
        const CONTENT_SELECTOR = [
            'article',
            'main',
            '.article-body',
            '.report-content',
            '.report-container',
            '.year-review-content',
            '.content',
            '.post-body',
            '.prose',
            '[data-context-ask]',
        ].join(', ');

        // Виджеты, где выделение – часть интерфейса, а не текст для вопроса.
        const EXCLUDE_SELECTOR = [
            '.cl-overlay',
            '.cx-overlay',
            '.term',
            '.cc-win',
            '.ask-tip',
            'nav',
            'header',
            'footer',
            'input',
            'textarea',
            '[data-no-context-ask]',
        ].join(', ');

        const MIN_LEN = 10;
        const MAX_LEN = 500;

        const tip = document.createElement('div');
        tip.className = 'ask-tip';
        tip.setAttribute('role', 'button');
        tip.setAttribute('tabindex', '0');
        tip.hidden = true;
        tip.textContent = '🤔 Спросить в чате';
        document.body.appendChild(tip);

        const overlay = document.createElement('div');
        overlay.className = 'cl-overlay';
        overlay.hidden = true;
        overlay.innerHTML =
            '<div class="cl-panel cl-panel--ask" role="dialog" aria-modal="true" aria-label="Анонимный вопрос по цитате">' +
                '<div class="cl-bar">' +
                    '<div class="cl-titles"><strong>Анонимный вопрос</strong>' +
                        '<span>уйдет на модерацию, автор не сохраняется</span></div>' +
                    '<button class="cl-close" type="button" aria-label="Закрыть">✕</button>' +
                '</div>' +
                '<blockquote class="ask-quote" data-ask-quote></blockquote>' +
                '<p class="ask-source" data-ask-source></p>' +
                '<p class="ask-status" data-ask-status role="status" aria-live="polite"></p>' +
                '<form class="cl-form">' +
                    '<input type="text" class="ask-hp" tabindex="-1" autocomplete="off" aria-hidden="true" data-ask-hp>' +
                    '<textarea class="cl-input" rows="1" placeholder="Напишите ваш вопрос к этой цитате…" data-ask-input></textarea>' +
                    '<button class="cl-send" type="submit" aria-label="Отправить">↑</button>' +
                '</form>' +
            '</div>';
        document.body.appendChild(overlay);

        const quoteEl = overlay.querySelector('[data-ask-quote]');
        const sourceEl = overlay.querySelector('[data-ask-source]');
        const statusEl = overlay.querySelector('[data-ask-status]');
        const inputEl = overlay.querySelector('[data-ask-input]');
        const honeypot = overlay.querySelector('[data-ask-hp]');
        const form = overlay.querySelector('.cl-form');
        const sendBtn = overlay.querySelector('.cl-send');

        let currentSelection = '';

        const hideTip = () => { tip.hidden = true; };

        // Текстовый узел не умеет closest – поднимаемся до ближайшего элемента.
        const elementOf = (node) =>
            !node ? null : node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

        // ── выделение ───────────────────────────────────────────────────────
        const updateTip = () => {
            if (!overlay.hidden) return;

            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) return hideTip();

            const text = selection.toString().trim();
            if (text.length < MIN_LEN || text.length > MAX_LEN) return hideTip();

            const range = selection.getRangeAt(0);
            // commonAncestorContainer, а не anchorNode: выделение через несколько
            // абзацев или пунктов списка проверяется по общему родителю.
            const host = elementOf(range.commonAncestorContainer);
            if (!host || !host.closest(CONTENT_SELECTOR)) return hideTip();
            if (host.closest(EXCLUDE_SELECTOR)) return hideTip();

            const rect = range.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return hideTip();

            currentSelection = text;
            tip.hidden = false;

            const top = rect.top + window.scrollY - tip.offsetHeight - 8;
            const left = rect.left + window.scrollX + rect.width / 2 - tip.offsetWidth / 2;
            const maxLeft = document.documentElement.clientWidth - tip.offsetWidth - 4;
            tip.style.top = `${Math.max(window.scrollY + 4, top)}px`;
            tip.style.left = `${Math.max(4, Math.min(left, maxLeft))}px`;
        };

        // selectionchange летит и во время протяжки – кнопку показываем по концу
        // жеста, иначе она прыгает под курсором. touchend закрывает мобильный кейс.
        let raf = 0;
        const scheduleUpdate = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(updateTip);
        };
        document.addEventListener('mouseup', scheduleUpdate);
        document.addEventListener('touchend', scheduleUpdate);
        document.addEventListener('keyup', (e) => { if (e.shiftKey) scheduleUpdate(); });
        document.addEventListener('selectionchange', () => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) hideTip();
        });
        window.addEventListener('scroll', hideTip, { passive: true });
        window.addEventListener('resize', hideTip);

        // ── модалка ─────────────────────────────────────────────────────────
        const pageUrl = () => window.location.href.split('#')[0];

        // Тайтл собран как "Заголовок | Тимлиды", поэтому режем по «|».
        // Резать по дефису нельзя: он живет внутри заголовков («AI-агенты»).
        const pageTitle = () => {
            const raw = document.querySelector('meta[property="og:title"]')?.content || document.title;
            return raw.split('|')[0].trim() || raw;
        };

        const setStatus = (text, kind) => {
            statusEl.textContent = text || '';
            statusEl.className = `ask-status${kind ? ` is-${kind}` : ''}`;
        };

        const open = (e) => {
            e.preventDefault(); // выделение не должно схлопнуться
            quoteEl.textContent = `«${currentSelection.replace(/\s+/g, ' ').trim()}»`;
            sourceEl.textContent = pageTitle();
            setStatus('');
            inputEl.value = '';
            inputEl.style.height = 'auto';
            hideTip();
            overlay.hidden = false;
            document.body.classList.add('cl-lock');
            setTimeout(() => inputEl.focus(), 50);
        };

        const close = () => {
            overlay.hidden = true;
            document.body.classList.remove('cl-lock');
        };

        tip.addEventListener('pointerdown', open);
        tip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });

        overlay.querySelector('.cl-close').addEventListener('click', close);
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close(); });

        inputEl.addEventListener('input', () => {
            inputEl.style.height = 'auto';
            inputEl.style.height = `${Math.min(inputEl.scrollHeight, 140)}px`;
        });
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
        });

        // ── отправка ────────────────────────────────────────────────────────
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const question = inputEl.value.trim();
            if (!question) return setStatus('Напишите вопрос.', 'error');
            if (honeypot.value !== '') return; // бот

            sendBtn.disabled = true;
            setStatus('Отправляем…');

            // Бот шлет сообщения без parse_mode (см. TelegramClient): текст автора
            // никогда не разбирается как разметка. Поэтому никакого Markdown –
            // верстаем то, что читается как обычный текст. Голую ссылку Telegram
            // подсветит сам. Перенос строк в цитате схлопываем: выделение через
            // абзацы иначе разваливает сообщение.
            const quote = currentSelection.replace(/\s+/g, ' ').trim();
            const text = [
                `📍 Вопрос из архива: ${pageTitle()}`,
                pageUrl(),
                '',
                'Цитата:',
                `«${quote}»`,
                '',
                `Вопрос: ${question}`,
            ].join('\n');

            try {
                const res = await fetch(window.TEAMLEADS_ANON_API || '/api/anon', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, source: 'context', website: honeypot.value }),
                });

                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    setStatus(`Отправлено на модерацию${data.publicId ? ` · ${data.publicId}` : ''}`, 'ok');
                    inputEl.value = '';
                    window.getSelection()?.removeAllRanges();
                    setTimeout(close, 1600);
                } else if (res.status === 429) {
                    setStatus('Слишком часто. Подождите немного.', 'error');
                } else if (res.status === 400) {
                    console.error('Context ask validation error:', await res.text());
                    setStatus('Вопрос не прошел проверку. Попробуйте сформулировать иначе.', 'error');
                } else {
                    setStatus('Не отправилось. Попробуйте позже.', 'error');
                }
            } catch (err) {
                console.error('Context ask:', err);
                setStatus('Ошибка сети.', 'error');
            } finally {
                sendBtn.disabled = false;
            }
        });
    }
})();
