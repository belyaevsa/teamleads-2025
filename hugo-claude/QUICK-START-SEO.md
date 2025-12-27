# Быстрый старт: SEO-оптимизация для teamleads.kz

## Что было сделано

Полная SEO-оптимизация Hugo-сайта для привлечения русскоязычной аудитории тимлидов в Telegram-чат @teamleads_kz.

### Основные изменения:

1. **SEO-метатеги** - уникальные title, description, keywords для всех 9 страниц
2. **Schema.org** - расширенная разметка (Organization, Article, WebSite)
3. **Open Graph** - динамические теги для соцсетей
4. **robots.txt** - оптимальные правила индексации
5. **CTA компоненты** - призывы к действию для Telegram
6. **Внутренние ссылки** - компонент related-pages
7. **SEO-конфигурация** - обновлен hugo.toml

---

## Сборка и проверка

### 1. Собрать сайт

```bash
cd /Users/sbelyaev/repos/teamleads-2025/hugo-claude

# Разработка (с live reload)
hugo server -D

# Production сборка
hugo --minify
```

### 2. Проверить изменения

```bash
# Проверить robots.txt
cat static/robots.txt

# Проверить конфигурацию
cat hugo.toml

# Проверить измененные файлы контента
ls -la content/*.md
```

### 3. Локальное тестирование

После запуска `hugo server -D`:

**Открыть страницы:**
- http://localhost:1313/ - Главная
- http://localhost:1313/overview - Обзор
- http://localhost:1313/topics - Темы
- http://localhost:1313/people - Участники
- http://localhost:1313/insights - Инсайты

**Проверить в DevTools:**
1. F12 → Elements → `<head>`
2. Проверить наличие метатегов
3. Проверить Schema.org (в конце `<head>`)

---

## Файлы, которые были изменены/созданы

### Изменены:

```
/content/_index.md          - Главная страница (SEO-метатеги)
/content/overview.md        - Обзор (SEO-метатеги)
/content/topics.md          - Темы (SEO-метатеги)
/content/people.md          - Участники (SEO-метатеги)
/content/network.md         - Сеть (SEO-метатеги)
/content/insights.md        - Инсайты (SEO-метатеги)
/content/sentiment.md       - Тональность (SEO-метатеги)
/content/timeline.md        - Хроника (SEO-метатеги)
/content/highlights.md      - Лучшее (SEO-метатеги)

/layouts/partials/head.html - Расширенные метатеги и Schema.org
/layouts/partials/footer.html - CTA для Telegram
/layouts/index.html         - Добавлен CTA блок

/hugo.toml                  - SEO-параметры
```

### Созданы:

```
/static/robots.txt                              - Правила индексации
/layouts/partials/components/cta-telegram.html  - Основной CTA
/layouts/partials/components/cta-telegram-compact.html - Компактный CTA
/layouts/partials/components/related-pages.html - Внутренние ссылки

/SEO-OPTIMIZATION-REPORT.md   - Полный отчет
/SEO-VALIDATION-CHECKLIST.md  - Чек-лист проверки
/QUICK-START-SEO.md           - Этот файл
```

---

## Целевые ключевые слова

### Главные запросы:
- Тимлид Казахстан
- Сообщество тимлидов
- Team lead KZ
- Управление командой разработки
- Engineering manager Казахстан
- Техлид

### Тематические запросы:
- AI ML в разработке
- QA тестирование для тимлидов
- HR для техлидов
- Процессы разработки
- Telegram чат разработчиков Казахстан

---

## Проверка SEO после деплоя

### 1. Базовая проверка

```bash
# Проверить robots.txt
curl https://teamleads.kz/robots.txt

# Проверить sitemap.xml
curl https://teamleads.kz/sitemap.xml

# Проверить метатеги главной
curl -s https://teamleads.kz/ | grep -i "<title>"
curl -s https://teamleads.kz/ | grep -i "description"
```

### 2. Google Rich Results Test

```
https://search.google.com/test/rich-results
```

Вставить URL:
- https://teamleads.kz/
- https://teamleads.kz/topics
- https://teamleads.kz/insights

### 3. Facebook Sharing Debugger

```
https://developers.facebook.com/tools/debug/
```

Проверить все основные страницы.

### 4. PageSpeed Insights

```
https://pagespeed.web.dev/
```

Целевые показатели:
- Performance: > 90
- SEO: 100
- Accessibility: > 90

---

## Настройка Google Search Console

### Шаг 1: Добавить сайт

1. Перейти: https://search.google.com/search-console
2. Добавить ресурс: `https://teamleads.kz`
3. Подтвердить владение (DNS, HTML файл, или через Google Analytics)

### Шаг 2: Отправить sitemap

1. Sitemaps → Add new sitemap
2. Ввести: `https://teamleads.kz/sitemap.xml`
3. Submit

### Шаг 3: Запросить индексацию

1. URL Inspection
2. Проверить каждую страницу
3. "Request Indexing"

---

## Настройка Google Analytics 4

### Создать GA4 Property

1. https://analytics.google.com/
2. Admin → Create Property
3. Название: "TeamLeads KZ"
4. Часовой пояс: Asia/Almaty
5. Получить Measurement ID (G-XXXXXXXXXX)

### Добавить код отслеживания

Добавить в `/layouts/partials/head.html` перед `</head>`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Настроить цели (Events)

**Telegram Click:**
```javascript
// При клике на кнопку Telegram
gtag('event', 'click_telegram', {
  'event_category': 'engagement',
  'event_label': 'telegram_cta'
});
```

---

## Мониторинг результатов

### Еженедельно:
- Проверить индексацию в Google: `site:teamleads.kz`
- Проверить позиции по ключевым запросам в Google Search Console

### Ежемесячно:
- Анализ органического трафика в GA4
- Проверка Core Web Vitals в PageSpeed Insights
- Проверка обратных ссылок (Ahrefs, SE Ranking)

### Ежеквартально:
- Обновление контента (добавление новых инсайтов)
- Проверка конкурентов
- Аудит технического SEO

---

## Дальнейшие шаги

### Приоритет 1 (в течение 1 недели):

1. **Деплой изменений** на production
2. **Настроить Google Search Console** и отправить sitemap
3. **Настроить Google Analytics 4** для отслеживания трафика
4. **Создать уникальные og:image** для каждой страницы (1200x630px)

### Приоритет 2 (в течение 1 месяца):

5. **Оптимизировать изображения** (WebP формат, ленивая загрузка)
6. **Создать блог-секцию** с регулярными постами
7. **Добавить FAQ страницу** с частыми вопросами тимлидов
8. **Настроить Яндекс.Метрику** для СНГ-аудитории

### Приоритет 3 (долгосрочно):

9. **Гостевые посты** на Habr, dev.to, Medium
10. **Интервью с топ-участниками** сообщества
11. **Кейс-стади** успешных команд
12. **Видео-контент** (YouTube интеграция)

---

## Ожидаемые метрики через 3 месяца

- **Индексация:** 100% страниц в Google и Яндекс
- **Органический трафик:** 50-100 посетителей/месяц
- **Позиции:** Топ-10 по "тимлид казахстан", "teamleads kz"
- **Конверсия в Telegram:** 20-30 новых участников из поиска

---

## Полезные ссылки

**Документация:**
- [Hugo SEO Best Practices](https://gohugo.io/templates/internal/#open-graph)
- [Schema.org Documentation](https://schema.org/)
- [Google Search Central](https://developers.google.com/search)

**Инструменты:**
- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- [PageSpeed Insights](https://pagespeed.web.dev/)
- [SSL Labs](https://www.ssllabs.com/ssltest/)

**Мониторинг:**
- [Google Search Console](https://search.google.com/search-console)
- [Google Analytics](https://analytics.google.com/)
- [Ahrefs](https://ahrefs.com/)
- [SE Ranking](https://seranking.com/)

---

## Контакты

**Telegram:** @teamleads_kz
**Сайт:** https://teamleads.kz

---

*Создано: 2025-12-27*
*Версия: 1.0*
