# Люди - Участники Сообщества

**URL**: `/people`
**Назначение**: Демонстрация людей, которые делают сообщество живым - топ-участники, основатели, восходящие звёзды и паттерны взаимодействия

---

## 🎯 Структура Контента

### Заголовок Страницы
**Заголовок**: "Люди Сообщества"
**Подзаголовок**: "1,247 участников. Тысячи историй. Одно сообщество."
**Главное изображение**: Абстрактная иллюстрация связанных людей (не визуализация данных)

---

## 📊 Инфографика 1: Большая Четвёрка в Центре Внимания
**Тип**: Сетка карточек с анимированной статистикой
**Библиотека**: Custom CSS Grid + GSAP
**Расположение**: Верх страницы, акцентированная

<!-- IMAGE GENERATION PROMPT:
Создай премиальную визуализацию "Большой Четвёрки" - топ-4 участников сообщества.

ДИЗАЙН-СИСТЕМА:
- Фон: Deep Space #0F172A
- Стиль: Bento Grid, glassmorphism карточки, Apple/Linear стиль
- Шрифты: Inter Bold 700 для имён, JetBrains Mono для цифр
- Разрешение: 4K (3840x2160px), широкий формат

LAYOUT: Сетка 2x2 с gap 32px, каждая карточка 1880x1040px

КАРТОЧКА 1 (левая верхняя) - Andrii Kurdiumov - 1 МЕСТО:
- Glassmorphism: rgba(30, 41, 59, 0.7), blur 12px, border-radius 24px
- Граница: 2px с золотым свечением (#FFD700 glow)
- Иконка: 👑 (64px) сверху слева
- Badge справа вверху: "Super Hub" на золотом фоне
- Имя по центру: "Andrii Kurdiumov" (Inter Bold 48px, #F8FAFC)
- Главная статистика крупно:
  "6 266" (JetBrains Mono Bold 96px, золотой градиент #FFD700 → #FFA500)
  "сообщений" (Inter 24px, #94A3B8)
- Под ней 3 строки:
  🎯 Безусловный лидер
  📅 Активен: 247 дней
  🔗 Влияние: 9.8/10
- Тонкая золотая линия прогресса внизу

КАРТОЧКА 2 (правая верхняя) - Артур Пан - 2 МЕСТО:
- Та же структура glassmorphism
- Граница: серебряное свечение (#C0C0C0)
- Иконка: ⭐ (64px)
- Badge: "Influencer" на серебряном фоне
- Имя: "Артур Пан"
- Статистика: "4 388" (серебряный градиент #C0C0C0 → #A9A9A9)
  "сообщений"
- Под ней:
  🎯 Генератор идей
  📅 Активен: 145 дней
  💡 Креативность: 9.5/10
- Серебряная линия прогресса

КАРТОЧКА 3 (левая нижняя) - Теймур Шайкемелов - 3 МЕСТО:
- Glassmorphism
- Граница: бронзовое свечение (#CD7F32)
- Иконка: 💎 (64px)
- Badge: "Co-Founder" на бронзовом фоне
- Имя: "Теймур Шайкемелов"
- Статистика: "3 105" (бронзовый градиент #CD7F32 → #B87333)
  "сообщений"
- Под ней:
  🎯 Организатор встреч
  📅 Активен: 198 дней
  🤝 Коммуникация: 9.2/10
- Бронзовая линия прогресса

КАРТОЧКА 4 (правая нижняя) - Stanislav Belyaev - 4 МЕСТО:
- Glassmorphism
- Граница: синее свечение (#1E90FF)
- Иконка: 🚀 (64px)
- Badge: "Connector" на синем фоне
- Имя: "Stanislav Belyaev"
- Статистика: "3 035" (синий градиент #1E90FF → #4169E1)
  "сообщений"
- Под ней:
  🎯 Самый регулярный
  📅 Активен: 252 дня
  ⚡ Консистентность: 10/10
- Синяя линия прогресса

ОБЩЕЕ:
- Заголовок сверху: "Большая Четвёрка" (Inter Bold 64px, #F8FAFC)
- Подзаголовок: "Ядро сообщества • 56% всех взаимодействий" (Inter 24px, #64748B)
- Выноска снизу: glassmorphism box с текстом:
  "Топ-4 = 16 794 сообщений (63% всех сообщений!)"
  "Ядро сообщества очень плотное."

ФОНОВЫЕ ЭФФЕКТЫ:
- Тонкий grid pattern
- Мягкие aurora пятна в цветах медалей (золото, серебро, бронза, синий)

НАСТРОЕНИЕ: Престижно, как награды. Celebration лидеров сообщества.
-->


### Four Cards (Equal Size, 2x2 Grid)

#### Card 1: Andrii Kurdiumov
```
👑 6 266 сообщений
🎯 Безусловный лидер
📅 Активен: 247 дней
```
**Badge**: "Super Hub"
**Color**: Gold gradient (#FFD700 → #FFA500)
**Icon**: Crown emoji

#### Card 2: Артур Пан
```
⭐ 4 388 сообщений
🎯 Генератор идей
📅 Активен: 145 дней
```
**Badge**: "Influencer"
**Color**: Silver gradient (#C0C0C0 → #A9A9A9)
**Icon**: Star emoji

#### Card 3: Теймур Шайкемелов
```
💎 3 105 сообщений
🎯 Организатор встреч
📅 Активен: 198 дней
```
**Badge**: "Co-Founder"
**Color**: Bronze gradient (#CD7F32 → #B87333)
**Icon**: Diamond emoji

#### Card 4: Stanislav Belyaev
```
🚀 3 035 сообщений
🎯 Самый регулярный
📅 Активен: 252 дня
```
**Badge**: "Connector"
**Color**: Blue gradient (#1E90FF → #4169E1)
**Icon**: Rocket emoji

### Visual Elements
- Hover: Card lifts, shows "View Profile" button
- Click: Navigate to detailed profile (modal or new page)
- Animated entry: Cards flip in from back
- Counter: Numbers count up on scroll

### Responsive
- Desktop: 2x2 grid
- Tablet: 2x2 grid (smaller cards)
- Mobile: 1 column stack

---

## 📊 Infographic 2: Top 20 Contributors Bar Chart
**Type**: Horizontal bar chart (sorted descending)
**Library**: D3.js or Chart.js
**Position**: After Big Four cards

### Data (Top Users)
```
1.  Andrii Kurdiumov:     6 266 ████████████████████
2.  Артур Пан:            4 388 ██████████████
3.  Теймур Шайкемелов:    3 105 ██████████
4.  Stanislav Belyaev:    3 035 █████████
5.  Dmitriy Melnik:       1 430 ████
6.  Антон:                1 593 █████
7.  Vassiliy:               869 ███
... (8 more)
```

### Visual Elements
- Bars: Blue gradient (#42A5F5 → #1565C0)
- Top 4: Different color (gold, silver, bronze, blue)
- Labels: Name + message count
- Hover: Show percentage of total, rank, active days
- Animated entry: Bars slide in from left sequentially

### Insights Callout
```
Топ 4 = 16 794 сообщений (63% всех сообщений!)
Ядро сообщества очень плотное.
```

### Responsive
- Desktop: Full 20 bars
- Mobile: Scrollable with top 10 visible

---

## 📊 Infographic 3: Contribution Distribution Donut
**Type**: Multi-layer donut chart
**Library**: Chart.js or D3.js
**Position**: Side-by-side with bar chart on desktop

### Data (Segmentation)
**Outer Ring**: Top 4 vs Others
- Top 4: 63% (highlighted)
- Others: 37%

### Visual Elements
- Color scale: Dark blue (super) → Light blue (casual)
- Center text: "139 активных"
- Hover: Show tier name, user count, percentage
- Click segment: Filter to that tier in other visualizations

### Animation
- Segments draw clockwise on scroll
- Center text counts up

### Responsive
- Desktop: 400px diameter, side panel
- Mobile: 300px diameter, full width, below bar chart

---

## 📊 Infographic 4: Founding Members Spotlight
**Type**: Timeline with profile cards
**Library**: Custom HTML/CSS + GSAP
**Position**: Mid-page section

### Content
**Title**: "Основатели - Первые участники"

**Timeline** (Horizontal):
- January 20, 2025 → First messages posted
- Profile cards attached to timeline

### Profile Cards (Mini)
- Andrii Kurdiumov
- Теймур Шайкемелов
- Stanislav Belyaev
- Nurlan N
- АДИЛЬБЕК

### Example
```
[Avatar] Andrii Kurdiumov
🏅 Founding Member
📅 Jan 20, 2025
💬 6 266 messages
```

### Visual Elements
- Cards aligned on timeline
- Hover: Card expands, shows quote from first message
- Animated entry: Cards slide up from timeline
- Medal icon: Gold badge for founders

### Responsive
- Desktop: Horizontal timeline with cards above/below (alternating)
- Mobile: Vertical timeline, cards stacked

---

## 📊 Infographic 5: Rising Stars 2024
**Type**: Animated leaderboard (top gainers)
**Library**: D3.js transition
**Position**: After founding members

### Data (Users with Fastest Growth)
**Criteria**: Joined during the year, high impact

```
1. [Антон]: 1 200 messages (150/day avg! 🚀)
2. [Arthur pandev.io]: 1 036 messages
3. [Denis]: 511 messages
4. [Андрей Звёздочка]: 292 messages
5. [Artem Galustyan]: 181 messages
```

### Visual Elements
- Leaderboard style: Rank number, name, stats
- Growth arrow: ↗️ next to each name
- Color: Bright green (#4CAF50) for rising stars
- Badge: "Rising Star 2025" 🌟
- Animated entry: Rows drop in from top with bounce

### Metrics Shown
- Messages posted
- Months active
- Messages per month average
- Growth trend (line sparkline)

### Responsive
- Desktop: Table format
- Mobile: Card stack with key metrics only

---

## 📊 Infographic 6: Activity Patterns by Top Contributors
**Type**: Multi-line chart (overlaid patterns)
**Library**: Apache ECharts
**Position**: Lower section

### Data
- X-axis: Months (Jan 2025 - Dec 2025)
- Y-axis: Messages per month
- Lines: One for each of the Big Four

### Lines
1. **Andrii Kurdiumov**: Solid blue line (#1565C0)
2. **Артур Пан**: Dashed orange line (#FF9800)
3. **Теймур Шайкемелов**: Dotted green line (#4CAF50)
4. **Stanislav Belyaev**: Dash-dot purple line (#9C27B0)

### Visual Elements
- Legend: Interactive (click to hide/show line)
- Markers: Dots at peak months
- Hover: Show all 4 values for that month
- Annotations: Mark key events (e.g., "Vacation", "Peak")

### Insights
- **Consistency**: Who maintains steady activity
- **Spikes**: Special events or discussions
- **Gaps**: Absences or quiet periods

### Responsive
- Desktop: Full multi-line chart
- Mobile: Stacked small multiples (one chart per person)

---

## 📊 Infographic 7: Messages per Day Heatmap (Top 10)
**Type**: Heatmap grid (10 rows × 7 columns)
**Library**: D3.js
**Position**: After line chart

### Data
- Rows: Top 10 contributors (by message count)
- Columns: Days of week (Mon-Sun)
- Cell color: Average messages per day for that person+weekday

### Visual Elements
- Color scale: White → Dark blue (0 → max)
- Row labels: Contributor name + total messages
- Column labels: Day abbreviations (Mon, Tue, etc.)
- Hover: Show name, day, average count

### Insights
- **Workday warriors**: High weekday activity
- **Weekend enthusiasts**: High Saturday/Sunday activity
- **Consistent**: Balanced across all days

### Responsive
- Desktop: Full grid
- Mobile: Scrollable horizontal, or accordion (tap name to expand)

---

## 📊 Infographic 8: Average Message Length by Contributor
**Type**: Bubble chart
**Library**: D3.js
**Position**: Side panel or lower section

### Data
- X-axis: Total message count
- Y-axis: Average message length (characters)
- Bubble size: Number of active days
- Bubble color: Sentiment (overall positive/negative/neutral tone)

### Visual Elements
- Bubbles: Semi-transparent with stroke
- Labels: Name appears on hover
- Quadrants: Divide into 4 zones
  - Top-right: Prolific + Long messages
  - Top-left: Few but detailed messages
  - Bottom-right: Prolific + Short messages
  - Bottom-left: Few and brief
- Hover: Show full stats

### Insights
- **Long-form writers**: Who writes essays
- **Quick responders**: Short, frequent messages
- **Balanced**: Moderate length and volume

### Responsive
- Desktop: Full interactive bubble chart
- Mobile: Simplified scatter, larger touch targets

---

## 📊 Infographic 9: Contributor Network Roles
**Type**: Role-based segmentation (pie or treemap)
**Library**: D3.js treemap
**Position**: Bottom of page

### Data (Based on Network Analysis)
**Roles** (derived from network centrality):
- **Hub Connectors** (high betweenness): 23 users
- **Topic Authorities** (high closeness): 67 users
- **Active Responders** (high in-degree): 134 users
- **Question Askers** (high out-degree): 298 users
- **Lurkers** (low centrality): 725 users

### Visual Elements
- Treemap: Rectangles sized by user count
- Color by role:
  - Hubs: Dark blue (#1565C0)
  - Authorities: Purple (#9C27B0)
  - Responders: Green (#4CAF50)
  - Askers: Orange (#FF9800)
  - Lurkers: Gray (#9E9E9E)
- Labels: Role name + user count + percentage
- Hover: Show role description, example users

### Insights Callout
```
Только 23 участника (1.8%) - Hub Connectors
Они соединяют разные части сообщества

725 участников (58.1%) - Lurkers
Читают больше, чем пишут (это нормально!)
```

### Responsive
- Desktop: Full treemap
- Mobile: Stacked bars (easier to read)

---

## 📈 Narrative Content Sections

### Section 1: The Core Four
**Position**: Before Infographic 1

**Text**:
```
Каждое сообщество имеет своё ядро.
В "Тимлид не кодит" это "Большая Четвёрка":
Andrii, Артур, Теймур и Stanislav.

Вместе они написали 16 794 сообщения (63% от всех).
Это лидеры мнений, менторы и сердце сообщества.
```

### Section 2: The Long Tail
**Position**: After Infographic 2 & 3

**Text**:
```
Топ-15 участников создают основной контент.
Но остальные 120+ активных участников добавляют разнообразие
мнений и вопросов.

Каждый голос важен, даже если это всего несколько сообщений.
```

### Section 3: Rising Stars
**Position**: After Infographic 5

**Text**:
```
2025 год принёс нам новые яркие голоса.
Антон (in_visionman) ворвался в декабре с 1 200 сообщениями за 8 дней!
```

---

## 🎬 Animations & Interactions

### On Page Load
1. Header fade-in
2. Big Four cards flip in from back (0.2s stagger)
3. Counters count up from 0

### On Scroll Entry
1. Bar chart bars slide in from left
2. Donut segments draw clockwise
3. Timeline cards pop up from timeline
4. Leaderboard rows drop in from top with bounce

### Hover Effects
- Cards: Lift (translateY(-10px)) + shadow increase
- Bars: Brighten color, show tooltip
- Bubbles: Scale(1.2), show label
- Lines: Thicken stroke, highlight related markers

### Click Interactions
- Big Four cards: Open detailed profile modal
- Bar chart: Filter other visualizations to that user
- Role segments: Highlight those users in other charts

---

## 📱 Responsive Design

### Desktop (> 1024px)
- Big Four: 2x2 grid
- Bar + Donut: Side-by-side (60/40 split)
- Timeline: Horizontal with alternating cards
- Heatmap: Full grid visible

### Tablet (768px - 1024px)
- Big Four: 2x2 grid (smaller)
- Bar + Donut: Stacked
- Timeline: Horizontal scrollable
- Heatmap: Scrollable horizontal

### Mobile (< 768px)
- Big Four: 1 column stack
- Bar chart: Top 10 only, vertical scroll
- Donut: Full width, below bar
- Timeline: Vertical
- Heatmap: Accordion (tap to expand)
- Bubble chart: Simplified scatter

---

## 🔢 Data Requirements

### Source Files
- `messages_export.csv`: All messages with user_name, timestamp, content
- `network_analysis_results.json`: Centrality metrics for role classification
- User aggregations: Pre-computed message counts, averages, activity days

### Computed Metrics
```sql
-- Top contributors
SELECT user_name, COUNT(*) as message_count,
       AVG(LENGTH(user_message)) as avg_length,
       COUNT(DISTINCT DATE(created_at)) as active_days
FROM messages
GROUP BY user_name
ORDER BY message_count DESC
LIMIT 20;

-- Activity by day of week
SELECT user_name, EXTRACT(dow FROM created_at) as weekday,
       COUNT(*) / COUNT(DISTINCT DATE_TRUNC('week', created_at)) as avg_per_day
FROM messages
WHERE user_name IN (SELECT user_name FROM top_20)
GROUP BY user_name, weekday;

-- Rising stars (joined after March 2024)
SELECT user_name,
       MIN(created_at) as first_message,
       COUNT(*) as total_messages,
       COUNT(*) / EXTRACT(month FROM age(MAX(created_at), MIN(created_at))) as msgs_per_month
FROM messages
WHERE created_at > '2024-03-01'
GROUP BY user_name
HAVING COUNT(*) > 200
ORDER BY msgs_per_month DESC;
```

---

## 🎨 Visual Design

### Color Palette
- **Big Four**:
  - Gold: #FFD700 (1st place)
  - Silver: #C0C0C0 (2nd place)
  - Bronze: #CD7F32 (3rd place)
  - Blue: #1E90FF (4th place)
- **Roles**:
  - Hubs: #1565C0 (dark blue)
  - Authorities: #9C27B0 (purple)
  - Responders: #4CAF50 (green)
  - Askers: #FF9800 (orange)
  - Lurkers: #9E9E9E (gray)

### Typography
- **Names**: Bold, 18px, dark gray (#212121)
- **Stats**: Regular, 14px, medium gray (#757575)
- **Badges**: Italic, 12px, accent color

### Spacing
- Card padding: 24px
- Grid gap: 16px
- Section margins: 48px vertical

---

### Key Takeaways Section
**Position**: End of page

**Title**: "Основные Выводы"

**Bullet Points**:
- 👥 139 активных участников (400+ в чате)
- 👑 "Большая Четвёрка" - 63% всех сообщений
- 🌟 Rising Stars: Антон (1 200 msgs) и Arthur (1 036 msgs)
- 📊 Плотное ядро и длинный хвост
- 🔗 Super Hub: Andrii Kurdiumov
- 🚀 Самый активный: 6 266 сообщений (Andrii)

---

## 🔗 Navigation

**Previous**: [← Overview](./overview.md)
**Next**: [Topics →](./topics.md)
**Related**: [Network](./network.md) - как участники связаны друг с другом

---

## 👤 Profile Modal Template
**Triggered**: Click on any contributor card/bar

**Modal Content**:
```
[Avatar Placeholder]

Name: Евгений Королюк
Badge: Most Active Contributor

STATS
💬 Messages: 1,933 (8.3% of total)
📅 Active Days: 287/365 (78.6%)
📊 Avg Message Length: 156 chars
🎯 Top Topic: AI & ML (67% of messages)
😊 Sentiment: 72% Neutral, 15% Positive, 13% Negative

ACTIVITY TIMELINE
[Mini line chart showing monthly activity]

TOP CONNECTIONS
[Mini network graph showing who they interact with most]

SAMPLE MESSAGES
[3-5 representative messages with dates]

[Close Button]
```

---

**Created**: December 26, 2025
**Data Source**: messages_export.csv, network_analysis_results.json
**Contributors Analyzed**: 1,247 unique users
