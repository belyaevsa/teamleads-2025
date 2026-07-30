(function initContextAsk() {
    // Ensure it only runs once
    if (window.__tlContextAskLoaded) return;
    window.__tlContextAskLoaded = true;

    // Wait for body to be available if script loaded synchronously in head somehow
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', initContextAsk);
        return;
    }

    // 1. Создаем UI элементы (кнопка и модалка) и внедряем в DOM
    const uiTemplate = `
        <style>
            #ask-tooltip {
                position: absolute; display: none; z-index: 1000;
                background: #333; color: #fff; padding: 6px 12px;
                border-radius: 6px; cursor: pointer; font-size: 14px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: opacity 0.2s;
            }
            #ask-tooltip:hover { background: #444; }
            #ask-modal {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5); display: none; justify-content: center;
                align-items: center; z-index: 1001;
            }
            #ask-modal.active { display: flex; }
            .ask-dialog {
                background: var(--bg, #fff); color: var(--text, #333);
                padding: 20px; border-radius: 8px; width: 90%; max-width: 400px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            }
            .ask-quote { font-style: italic; color: var(--text-muted, #666); border-left: 3px solid var(--border-color, #ccc); padding-left: 10px; margin-bottom: 15px; font-size: 14px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
            .ask-textarea { width: 100%; height: 80px; padding: 10px; margin-bottom: 15px; border: 1px solid var(--border-color, #ccc); border-radius: 4px; resize: none; font-family: inherit; background: var(--bg-alt, #fafafa); color: var(--text, #333); box-sizing: border-box; }
            .ask-actions { display: flex; justify-content: flex-end; gap: 10px; }
            .ask-btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-family: inherit; }
            .ask-btn-cancel { background: var(--bg-hover, #eee); color: var(--text, #333); }
            .ask-btn-cancel:hover { background: var(--border-color, #ddd); }
            .ask-btn-submit { background: var(--accent, #00AFCA); color: #fff; }
            .ask-btn-submit:hover { opacity: 0.9; }
            .ask-btn-submit:disabled { opacity: 0.7; cursor: not-allowed; }
            #ask-website-hp { display: none; } /* Honeypot */
        </style>

        <div id="ask-tooltip">🤔 Спросить в чате</div>

        <div id="ask-modal">
            <div class="ask-dialog">
                <h3 style="margin-top:0; margin-bottom: 15px;">Анонимный вопрос</h3>
                <div class="ask-quote" id="ask-quote-text"></div>
                <input type="text" id="ask-website-hp" value="" tabindex="-1" autocomplete="off">
                <textarea id="ask-input" class="ask-textarea" placeholder="Напишите ваш вопрос к этому абзацу..."></textarea>
                <div class="ask-actions">
                    <button class="ask-btn ask-btn-cancel" id="ask-cancel">Отмена</button>
                    <button class="ask-btn ask-btn-submit" id="ask-submit">Отправить</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', uiTemplate);

    const tooltip = document.getElementById('ask-tooltip');
    const modal = document.getElementById('ask-modal');
    const quoteEl = document.getElementById('ask-quote-text');
    const inputEl = document.getElementById('ask-input');
    const submitBtn = document.getElementById('ask-submit');
    const cancelBtn = document.getElementById('ask-cancel');
    const honeypot = document.getElementById('ask-website-hp');

    let currentSelection = '';

    // 2. Логика выделения текста
    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            tooltip.style.display = 'none';
            return;
        }

        const text = selection.toString().trim();
        const anchor = selection.anchorNode;
        const anchorElement = anchor && (anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor);
        const isContent = anchorElement && typeof anchorElement.closest === 'function' && anchorElement.closest('article, .content, .post-body, .prose, .article-body, .report-content');

        if (text.length > 10 && text.length < 500 && isContent) {
            currentSelection = text;
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            // Do not show if selection bounds are invalid
            if (rect.width === 0 || rect.height === 0) return;

            tooltip.style.display = 'block';
            tooltip.style.top = `${rect.top + window.scrollY - 35}px`;
            tooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (tooltip.offsetWidth / 2)}px`;
        } else {
            tooltip.style.display = 'none';
        }
    });

    // Hide tooltip on outside click
    document.addEventListener('mousedown', (e) => {
        if (e.target !== tooltip && !tooltip.contains(e.target)) {
            tooltip.style.display = 'none';
        }
    });

    // 3. Открытие модалки
    tooltip.addEventListener('mousedown', (e) => {
        e.preventDefault(); // чтобы выделение не сбросилось
        quoteEl.textContent = `"${currentSelection}"`;
        modal.classList.add('active');
        inputEl.value = '';
        tooltip.style.display = 'none';
        setTimeout(() => inputEl.focus(), 50);
    });

    // 4. Закрытие модалки
    const closeModal = () => modal.classList.remove('active');
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });

    // 5. Отправка на бэкенд
    submitBtn.addEventListener('click', async () => {
        const question = inputEl.value.trim();
        if (!question) return;

        // Защита от ботов
        if (honeypot.value !== "") return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправка...';

        const pageUrl = window.location.href.split('#')[0]; // без якорей
        let pageTitle = document.title.split('-')[0].trim();
        if (pageTitle.includes('|')) {
            pageTitle = pageTitle.split('|')[0].trim();
        }

        // Форматируем текст, который уйдет в Telegram-бот
        const fullText = `📍 Вопрос из архива: [${pageTitle}](${pageUrl})\n\nЦитата:\n> ${currentSelection}\n\nВопрос: ${question}`;

        let apiUrl = window.TEAMLEADS_ANON_API || '/api/anon';
        if (!window.TEAMLEADS_ANON_API && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            apiUrl = 'http://localhost:5080/api/anon';
        }

        try {
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: fullText, 
                    source: 'context',
                    website: honeypot.value 
                })
            });

            if (res.ok) {
                const data = await res.json();
                inputEl.value = '';
                alert(`Ваш вопрос отправлен на модерацию!\nID: ${data.publicId || 'успешно'}`);
                closeModal();
                window.getSelection().removeAllRanges();
            } else if (res.status === 429) {
                alert("Вы задаете вопросы слишком часто. Подождите немного.");
            } else if (res.status === 400) {
                const err = await res.json();
                console.error('Validation error:', err);
                alert("Ошибка валидации. Проверьте ваш текст.");
            } else {
                alert("Ошибка отправки. Попробуйте позже.");
            }
        } catch (e) {
            console.error("Ошибка:", e);
            alert("Ошибка сети.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Отправить';
        }
    });
})();