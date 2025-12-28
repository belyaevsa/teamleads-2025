# Style Guide

This document defines the writing and formatting conventions for the Hugo site.

## Typography

### Dashes

**ALWAYS use en-dash (–), NEVER em-dash (—)**

| Type | Symbol | Usage | Example |
|------|--------|-------|---------|
| **En-dash** ✅ | – | Ranges, connections, descriptions | Большая Четвёрка – генераторы контента |
| **Em-dash** ❌ | — | **DO NOT USE** | ~~Большая Четвёрка — генераторы контента~~ |
| Hyphen | - | Compound words, line breaks | Русско-английский |

**Why en-dash?**
- Cleaner, more modern typography
- Better readability in Russian text
- Consistent with contemporary web design standards

### Spacing Around Dashes

Use spaces around en-dashes:
- ✅ `текст – пояснение`
- ❌ `текст–пояснение`
- ❌ `текст- пояснение`

## Russian Typography

### Date Format

**ALWAYS use dd.mm.yyyy format (Russian standard)**

| Format | Example | Usage |
|--------|---------|-------|
| **dd.mm.yyyy** ✅ | 20.01.2025 | Standard Russian date format |
| **YYYY-MM-DD** ❌ | 2025-01-20 | **DO NOT USE** in user-facing content |

**Examples:**
- ✅ `20.01.2025` (preferred)
- ✅ `03.03.2025`
- ❌ `2025-01-20`
- ❌ `01/20/2025`

**Notes:**
- Use leading zeros for single-digit days and months
- Dots as separators (not slashes or hyphens)
- ISO format (YYYY-MM-DD) is acceptable only for internal/technical data sorting

### Quotation Marks

Use straight quotes (" "), not typographic quotes:
- ✅ "Большая Четвёрка"
- ❌ «Большая Четвёрка»

### Numbers

**Russian number formatting:**

1. **Thousands separator: space (not comma)**
   - ✅ `26 600` (with space)
   - ❌ `26,600` or `26600`

2. **Decimal separator: comma (optional, prefer rounding)**
   - ✅ `95,5` (with comma)
   - ❌ `95.5` (dot)
   - ✅ `96` (preferred – round when possible)

**Smart rounding rules:**

- **Integers near round hundreds/thousands:**
  - `11 499` → `11 500`
  - `11 410` → `11 400`
  - `6 266` → `6 300`
  - `4 388` → `4 400`
  - `3 105` → `3 100`
  - `3 035` → `3 000`

- **Decimals:**
  - `59,9%` → `60%` (round up)
  - `59,1%` → `59%` (round down)
  - `69,6%` → `70%` (round to nearest)
  - `11,8%` → `12%` (round to nearest)
  - `19,1%` → `19%` (round down)
  - `13,4%` → `13%` (round down)

**Examples:**
- ✅ `26 600 сообщений`
- ✅ `70% нейтральных`
- ✅ `12% вопросов`
- ✅ `6 300 сообщений`
- ❌ `26,600 сообщений`
- ❌ `69.6% нейтральных`
- ❌ `11.8% вопросов`
- ❌ `6266 сообщений`

## Code Formatting

### Hugo Templates

- Use 2-space indentation
- Keep template logic comments clear: `{{- /* Comment */ -}}`
- Use whitespace control (`{{-` and `-}}`) to prevent unwanted spaces

### JSON

- Use 2-space indentation
- Always include trailing commas for arrays/objects (except last item)
- Use double quotes for strings

## Content Writing

### Tone

- Professional but approachable
- Russian with natural IT-slang (коммиты, контрибьютеры, хайп)
- Avoid excessive emojis unless contextually appropriate

### Headers

- Use sentence case, not title case
- Keep headers concise and descriptive
- Use emoji sparingly in headers (only when it adds meaning)

## File Naming

### Images

- Use lowercase
- Use hyphens, not underscores: `network-graph.jpg`
- Include descriptive names: `andrii-avatar.jpg` not `img1.jpg`

### Templates

- Use lowercase
- Use hyphens for multi-word names: `profile-card.html`
- Partials in `/layouts/partials/components/`

## Automated Checks

To replace any em-dashes that slip in:

```bash
find . -type f \( -name "*.html" -o -name "*.md" -o -name "*.json" \) \
  -not -path "*/node_modules/*" -not -path "*/public/*" \
  -exec sed -i '' 's/—/–/g' {} \;
```

## Examples

### Good

```html
<p>Уровень 1 – это не просто "буфер" между ядром и остальными.</p>
<p>Многоуровневая структура сообщества – от ядра к периферии</p>
<p>63% сообщений от 4 человек – зависимость</p>
```

### Bad

```html
<p>Уровень 1 — это не просто "буфер" между ядром и остальными.</p>
<p>Многоуровневая структура сообщества—от ядра к периферии</p>
<p>63% сообщений от 4 человек- зависимость</p>
```

---

**Last updated:** 27.12.2025
**Applies to:** All content, layouts, and data files
