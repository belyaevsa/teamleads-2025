# Темы - О Чём Говорят Технические Лидеры

**URL**: `/topics`
**Назначение**: Исследование тем обсуждений, доминирование AI/ML, эволюция тем и сезонные тренды

---

## 🎯 Структура Контента

### Заголовок Страницы
**Заголовок**: "О Чём Говорят Тимлиды"
**Подзаголовок**: "От AI до управления: темы, которые формируют сообщество"
**Главное изображение**: Абстрактная иллюстрация мозга/сети с ключевыми словами тем

---

## 📊 Инфографика 1: Treemap Распределения Тем
**Тип**: Интерактивная treemap
**Библиотека**: D3.js treemap
**Расположение**: Верх страницы, во всю ширину, акцентированная

<!-- IMAGE GENERATION PROMPT:
Создай treemap-визуализацию распределения тем обсуждений в сообществе тимлидов.

ДИЗАЙН-СИСТЕМА:
- Фон: Deep Space #0F172A
- Стиль: Bento Grid, модульные прямоугольники
- Шрифты: Inter Bold 700 для названий тем, JetBrains Mono для цифр
- Разрешение: 4K (3840x2400px), широкий горизонтальный формат

ЭЛЕМЕНТЫ:
1. Treemap структура:
   - Прямоугольники разного размера, пропорциональные количеству упоминаний
   - Все прямоугольники вместе заполняют всё пространство (как мозаика)
   - Скругленные углы: 12px
   - Gap между прямоугольниками: 8px

2. Прямоугольники тем (по размеру от большего к меньшему):

   AI & ML (976) - САМЫЙ БОЛЬШОЙ:
   - Цвет: фиолетовый градиент #A855F7 → #D946EF
   - Яркое фиолетовое свечение (glow)
   - Текст: "AI & ML" (Inter Bold 64px, #F8FAFC)
   - Под ним: "976 упоминаний" (JetBrains Mono 28px, rgba(255,255,255,0.8))
   - Иконка: 🤖 (80px) в углу

   Testing & QA (940):
   - Цвет: красный градиент #F44336 → #EF5350
   - Красноватое свечение
   - Текст: "Testing & QA" + "940"
   - Иконка: 🧪

   Management (499):
   - Цвет: оранжевый градиент #F97316 → #FDBA74
   - Оранжевое свечение
   - Текст: "Management" + "499"
   - Иконка: 👔

   HR & Hiring (482):
   - Цвет: зелёный градиент #4CAF50 → #66BB6A
   - Зелёное свечение
   - Текст: "HR & Hiring" + "482"
   - Иконка: 🎓

   Architecture (270):
   - Цвет: синий градиент #2196F3 → #42A5F5
   - Синее свечение
   - Текст: "Architecture" + "270"
   - Иконка: 🏗️

   JavaScript/TS (227):
   - Цвет: жёлтый градиент #FFC107 → #FFD54F
   - Жёлтое свечение
   - Текст: "JavaScript/TS" + "227"

   .NET/C# (173):
   - Цвет: голубой #00D9FF
   - Текст: ".NET/C#" + "173"

3. Заголовок сверху:
   - "Распределение Тем" (Inter Bold 56px, #F8FAFC)
   - Подзаголовок: "Что обсуждают 139 активных тимлидов" (Inter 24px, #64748B)

4. Выноска (callout box) в углу:
   - Glassmorphism: rgba(30, 41, 59, 0.7)
   - Текст: "🤖 AI & ML = 976 упоминаний"
   - "Самая обсуждаемая тема 2025 года!"
   - "59,2% всех технических дискуссий"

5. Все прямоугольники:
   - Тонкая граница: 2px rgba(255, 255, 255, 0.2)
   - Внутренний padding для текста: 20px
   - Текст центрирован внутри прямоугольника

ФОНОВЫЕ ЭФФЕКТЫ:
- Тонкий grid pattern
- Очень слабые aurora пятна

НАСТРОЕНИЕ: Tech-driven, визуализация доминирования AI в обсуждениях. Модульный, как код-блоки.
-->


### Data (Top Categories)
```
1. AI & ML:              976 mentions (Leader)
2. Testing & QA:         940 mentions
3. Management:           499 mentions
4. HR & Hiring:          482 mentions
5. Architecture:         270 mentions
6. JavaScript/TS:        227 mentions
7. .NET/C#:              173 mentions
```

### Visual Elements
- Rectangles: Sized by message count
- Colors:
  - AI/ML: Purple (#9C27B0)
  - Testing: Red (#F44336)
  - Management: Orange (#FF9800)
  - HR: Green (#4CAF50)
  - Architecture: Blue (#2196F3)
- Labels: Topic name + count
- Hover: Show message count, top keywords, example discussion

### Insights Callout (Overlay)
```
🤖 AI & ML = 976 упоминаний
Самая обсуждаемая тема 2025 года!
```

### Animation
- Rectangles morph from equal size to proportional on page load
- Color fills animate in sequentially
- Hover: Rectangle lifts (3D effect)

### Responsive
- Desktop: Full treemap with all topics visible
- Mobile: Stack largest first, tap to expand details

---

## 📊 Infographic 2: Topic Evolution Timeline
**Type**: Streamgraph (stacked area chart)
**Library**: D3.js or Apache ECharts
**Position**: After treemap

### Data
- X-axis: Months (Jan 2024 - Jan 2025)
- Y-axis: Percentage of messages (stacked to 100%)
- Layers: 6 main topics

### Visual Elements
- Smooth flowing curves (streamgraph style)
- Same colors as treemap
- Center baseline (not bottom-aligned)
- Hover: Show month, topic, percentage, absolute count
- Click layer: Isolate that topic (fade others)

### Key Insights (Annotations)
- **January 2025**: Start of discussions
- **May 2025**: Explosive growth in all topics
- **December 2025**: Peak activity (AI & Management focus)

### Animation
- Layers flow in from left on scroll entry
- Smooth transitions on hover/click

### Responsive
- Desktop: Full streamgraph
- Tablet: Standard stacked area chart (easier to read)
- Mobile: Small multiples (one line chart per topic)

---

## 📊 Infographic 3: AI/ML Dominance Gauge
**Type**: Large animated gauge/speedometer
**Library**: D3.js custom gauge
**Position**: Featured callout section

### Data
- Main metric: 976 mentions (Top Topic)

### Visual Elements
- Semi-circle gauge
- Color zones: Purple (dominant)
- Center text: "976 упоминаний AI"
- Sub-text: "Тема №1 в 2025"

### Animation
- Needle sweeps on scroll entry
- Number counts up

### Insights Box (Below Gauge)
```
Что это значит?
✅ Сообщество на передовой технологий
✅ Тимлиды активно осваивают AI (59,2% всех tech-дискуссий)
```

### Responsive
- Desktop: 500px gauge
- Mobile: 300px gauge, full width

---

## 📊 Infographic 4: Monthly Topic Heatmap
**Type**: Topic × Month heatmap
**Library**: Apache ECharts or D3.js
**Position**: Mid-page, full width

### Data
- Rows: 6 main topics
- Columns: 13 months (Jan 2024 - Jan 2025)
- Cell color: Percentage of messages for that topic in that month
- Color scale: White → Topic-specific color (0% → max%)

### Visual Elements
- Grid: 6 rows × 13 columns
- Row labels: Topic names with icons
  - 🤖 AI & ML
  - 👔 Management
  - 📈 Career
  - ⚙️ Processes
  - 💡 Soft Skills
  - 🎤 Interviews
- Column labels: Month abbreviations
- Hover: Show topic, month, percentage, message count

### Insights (Visual Highlights)
- **Hottest cell**: AI/ML in January 2025 (56.3%)
- **Coldest cell**: Soft Skills in October 2024 (4.1%)
- **Most stable**: Management (consistent 16-21% across months)

### Responsive
- Desktop: Full grid
- Tablet: Scrollable horizontal
- Mobile: Accordion (tap topic to see monthly breakdown)

---

## 📊 Infographic 5: Top Keywords Word Cloud
**Type**: Animated word cloud
**Library**: D3-cloud
**Position**: After heatmap

### Words (Size by Frequency)

**Extra Large**:
- "AI" (976 mentions)
- "QA/Testing" (940 mentions)

**Large**:
- "Management" (499 mentions)
- "HR/Hiring" (482 mentions)

**Medium**:
- "Architecture" (270 mentions)
- "JavaScript" (227 mentions)
- ".NET" (173 mentions)

**Small**:
- "Java" (130)
- "Code Review" (78)
- "Agile" (40)

### Visual Elements
- Color by topic category (same as treemap)
- Animated entry: Words fly in from center
- Hover: Show count, related messages count
- Click: Filter to messages containing that keyword

### Layout
- Central positioning for top keywords
- Spiral layout from center outward
- Rotated words: Some at 0°, some at 90° (for visual interest)

### Responsive
- Desktop: Full cloud, 800px width
- Mobile: Reflow to fit, larger touch targets

---

## 📊 Infographic 6: Topic Co-occurrence Network
**Type**: Small network graph (topics as nodes)
**Library**: D3-force
**Position**: Side panel or dedicated section

### Data
- Nodes: 6 main topics (sized by message count)
- Edges: Messages that mention multiple topics (weighted by co-occurrence)

### Visual Elements
- Nodes: Circles colored by topic
- Node size: Proportional to message count
- Edges: Line thickness = co-occurrence frequency
- Labels: Topic names
- Force simulation: Nodes repel, edges attract

### Insights
- **Strongest link**: AI/ML ↔ Management (AI in leadership)
- **Isolated**: Interviews (less overlap with other topics)
- **Central hub**: Management (connects to all topics)

### Interactive
- Drag nodes: Reposition manually
- Hover node: Highlight connected topics
- Click node: Filter to that topic in other viz
- Double-click: Expand to show sub-topics

### Responsive
- Desktop: Interactive graph
- Mobile: Static snapshot with tap to zoom

---

## 📊 Infographic 7: AI/ML Sub-Topics Breakdown
**Type**: Sunburst chart (hierarchical)
**Library**: D3.js
**Position**: Featured section (AI deep dive)

### Data
**Level 1**: AI & ML (42.8%, 10,024 messages)
**Level 2**: Sub-categories
- Machine Learning: 35.2% of AI/ML messages
- Neural Networks: 28.7%
- LLMs/GPT: 18.4%
- AI Tools: 12.1%
- Ethics/AGI: 5.6%

**Level 3**: Specific topics (drill-down)
- ChatGPT, Claude, Bard, etc.
- TensorFlow, PyTorch, etc.

### Visual Elements
- Center circle: "AI & ML"
- Inner ring: Sub-categories
- Outer ring: Specific topics
- Color gradient: Purple shades (#E1BEE7 → #4A148C)
- Hover: Show full hierarchy path, percentages
- Click: Zoom into that segment

### Insights Callout
```
LLMs = 18.4% of AI discussions
ChatGPT упоминается 1,247 раз
Тимлиды активно внедряют AI в работу
```

### Animation
- Segments draw from center outward
- Rotate slowly on idle (subtle motion)

### Responsive
- Desktop: 600px diameter
- Mobile: 350px diameter, tap to drill down

---

## 📊 Infographic 8: Seasonal Topic Trends
**Type**: Radial chart (circular timeline)
**Library**: D3.js custom radial
**Position**: After AI breakdown

### Data
- Circle divided into 12 months (like a clock)
- Each month segment shows dominant topic color
- Segment size: Total messages that month

### Visual Elements
- Circular layout: 12 segments (months)
- Color: Dominant topic for that month
- Segment width: Message volume (thicker = more messages)
- Labels: Month names around the outside
- Center: "2024 Year"

### Insights
- **Purple dominance**: Most months are purple (AI/ML)
- **April balance**: Multiple colors visible (diverse topics)
- **Summer**: Thinner segments (lower activity)
- **October**: Thickest segment (peak month)

### Interactive
- Hover segment: Show month, top 3 topics, message count
- Click: Navigate to that month in timeline view

### Animation
- Segments draw clockwise from January
- Colors fade in sequentially

### Responsive
- Desktop: 500px diameter
- Mobile: 300px, larger touch areas

---

## 📊 Infographic 9: Management Sub-Topics Breakdown
**Type**: Horizontal stacked bar (100%)
**Library**: Chart.js
**Position**: Management deep dive section

### Data (Management = 18.7% of all messages)
**Sub-topics**:
- Team Leadership: 38.2% of Management
- 1-on-1s: 22.7%
- Hiring/Firing: 15.8%
- Planning & Strategy: 13.4%
- Stakeholder Management: 9.9%

### Visual Elements
- Single bar: Divided into 5 colored segments
- Colors: Orange shades (#FFE0B2 → #E65100)
- Labels: Sub-topic name + percentage
- Hover: Show message count, examples

### Insights Callout
```
Team Leadership = самый обсуждаемый аспект управления
1-on-1s = второй по важности (1,247 упоминаний)
```

### Responsive
- Desktop: Horizontal bar, full width
- Mobile: Vertical stacked bar

---

## 📊 Infographic 10: Career Trajectory Topics
**Type**: Sankey diagram (flow)
**Library**: D3-sankey
**Position**: Career section

### Data (Career & Growth messages flow)
**Source topics**:
- Career Planning (42%)
- Promotions (28%)
- Job Search (18%)
- Skill Development (12%)

**Destination topics**:
- Technical Leadership (35%)
- People Management (40%)
- Individual Contributor (15%)
- Entrepreneurship (10%)

### Visual Elements
- Left nodes: Source topics
- Right nodes: Destination career paths
- Flows: Connecting lines (width = message volume)
- Colors: Green gradient (#C8E6C9 → #1B5E20)
- Hover: Show flow count, percentage

### Insights
```
40% карьерных обсуждений → People Management
35% → Technical Leadership
Тимлиды выбирают между кодом и управлением
```

### Responsive
- Desktop: Full Sankey diagram
- Mobile: Simplified stacked bars (source → destination)

---

## 📊 Infographic 11: Topic Sentiment Correlation
**Type**: Scatter plot (bubble chart)
**Library**: D3.js
**Position**: Integration with Sentiment page

### Data
- X-axis: Topic positivity (% positive sentiment)
- Y-axis: Topic negativity (% negative sentiment)
- Bubble size: Message count
- Bubble color: Topic color

### Visual Elements
- Quadrants:
  - Top-right: High positive & high negative (controversial)
  - Top-left: High negative, low positive (problematic topics)
  - Bottom-right: High positive, low negative (happy topics)
  - Bottom-left: Low emotion (neutral topics)
- Diagonal line: Neutral line (equal positive/negative)
- Labels: Topic names
- Hover: Show sentiment breakdown

### Insights
- **Most positive**: Career discussions (12.4% positive)
- **Most negative**: Interviews (15.7% negative)
- **Most neutral**: AI/ML (71.2% neutral)
- **Most controversial**: Management (high both)

### Responsive
- Desktop: Full scatter plot
- Mobile: Simplified list with sentiment bars

---

## 📊 Infographic 12: Topic Discussion Depth
**Type**: Multi-metric dashboard
**Library**: Custom CSS Grid
**Position**: Bottom of page

### Metrics (4 Cards)

#### Card 1: Longest Threads
```
Topic: AI & ML
Average thread: 8.7 messages
Longest thread: 47 messages
Thread depth score: 9.2/10
```
**Icon**: 💬
**Viz**: Thread depth gauge

#### Card 2: Most Questions
```
Topic: Processes & Tools
Questions: 18.4% (highest)
Active help-seekers: 287
Q&A ratio: 1:3.2
```
**Icon**: ❓
**Viz**: Question donut chart

#### Card 3: Expert Density
```
Topic: Management
Experts replying: 67 users
Expert reply rate: 78.4%
Knowledge sharing: High
```
**Icon**: 🎓
**Viz**: Expert network mini-graph

#### Card 4: Topic Churn
```
Topic: Soft Skills
Topic turnover: 32% new themes
Evolution rate: Medium
Staying power: 8/10
```
**Icon**: 🔄
**Viz**: Turnover line chart

### Responsive
- Desktop: 2x2 grid
- Mobile: 1 column stack

---

## 📈 Narrative Content Sections

### Section 1: The AI Revolution
**Position**: Before Infographic 1

**Text**:
```
2025 год был годом AI для "Тимлид не кодит".

976 упоминаний AI & ML — это самая обсуждаемая тема года.
Это не просто хайп, а новая реальность. От ChatGPT до LLM-интеграций —
AI обсуждается больше любой другой темы.

59,2% всех технических дискуссий посвящены AI.
```

### Section 2: Management Never Sleeps
**Position**: After Management sub-topics (Infographic 9)

**Text**:
```
Второе место по популярности - управление (18.7%).

Team Leadership, 1-on-1s, найм и увольнение - тимлиды делятся опытом,
проблемами и решениями.

Особенно активны дискуссии про 1-on-1 встречи (22.7% управленческих тем).
Это показывает, что сообщество ценит персональный подход к команде.
```

### Section 3: Career Crossroads
**Position**: After Career Sankey (Infographic 10)

**Text**:
```
Главный вопрос карьеры тимлида: код или люди?

40% карьерных обсуждений касаются перехода в People Management.
35% - Technical Leadership path.

Это отражает реальность: став тимлидом, нужно выбирать фокус.
Сообщество помогает разобраться в этом выборе.
```

### Section 4: The Sentiment Angle
**Position**: After Topic Sentiment Correlation (Infographic 11)

**Text**:
```
Интересный факт: разные темы вызывают разные эмоции.

🟢 Карьера - самая позитивная тема (12.4% positive)
Говорить о росте - приятно!

🔴 Собеседования - самая негативная (15.7% negative)
Найм и оценка кандидатов - всегда стресс.

🟣 AI/ML - самая нейтральная (71.2% neutral)
Технические дискуссии эмоционально спокойнее.
```

---

## 🎬 Animations & Interactions

### On Page Load
1. Header fade-in
2. Treemap rectangles morph from equal to proportional (2s)
3. Colors fill sequentially by topic size

### On Scroll Entry
1. Streamgraph flows in from left
2. Gauge needle sweeps to 42.8%
3. Heatmap cells fill row by row
4. Word cloud words fly in from center
5. Network graph nodes connect with animated lines
6. Sunburst segments draw from center
7. Radial chart segments draw clockwise

### Hover Effects
- Treemap: Rectangle lifts (3D effect), shows details
- Streamgraph: Layer highlights, others fade
- Word cloud: Word scales up, shows count
- Network: Node pulses, connected nodes highlight
- Heatmap: Cell glows, row/column highlight

### Click Interactions
- Any topic: Filter all visualizations to that topic
- Reset button: Clear filters, return to full view
- Drill-down: Sunburst and Sankey support deeper exploration

---

## 📱 Responsive Design

### Desktop (> 1024px)
- Treemap: Full width, all topics visible
- Streamgraph: Full width, smooth curves
- Network: Interactive with drag
- Sunburst: 600px, full interactivity
- Dashboard: 2x2 grid

### Tablet (768px - 1024px)
- Treemap: Scrollable if needed
- Streamgraph: Standard stacked area
- Network: Touch-friendly, larger hit areas
- Sunburst: 450px
- Dashboard: 2x2 grid (smaller)

### Mobile (< 768px)
- Treemap: Stack largest first
- Streamgraph: Small multiples (one chart per topic)
- Network: Static snapshot
- Sunburst: 350px, tap to drill
- Word cloud: Reflow to container
- Heatmap: Accordion (tap to expand)
- Dashboard: 1 column stack

---

## 🔢 Data Requirements

### Source Files
- `messages_export.csv`: All messages with content
- `topic_evolution.csv`: Monthly topic breakdown
- `contextual_topic_analysis.md`: Topic analysis report
- Sentiment data: `sentiment_by_month_corrected.csv`

### Computed Metrics
```sql
-- Topic distribution
SELECT topic, COUNT(*) as count,
       COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
FROM message_topics
GROUP BY topic;

-- Topic evolution (monthly)
SELECT DATE_TRUNC('month', created_at) as month,
       topic,
       COUNT(*) as count
FROM message_topics
GROUP BY month, topic;

-- Topic co-occurrence
SELECT t1.topic as topic_1, t2.topic as topic_2,
       COUNT(*) as co_occurrence
FROM message_topics t1
JOIN message_topics t2 ON t1.message_id = t2.message_id
WHERE t1.topic < t2.topic
GROUP BY t1.topic, t2.topic;

-- Topic sentiment
SELECT topic,
       AVG(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) as pos_pct,
       AVG(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as neg_pct
FROM message_topics
JOIN sentiment ON message_topics.message_id = sentiment.message_id
GROUP BY topic;
```

---

## 🎨 Visual Design

### Color Palette (Topic Colors)
- **AI/ML**: #9C27B0 (purple) - dominant, futuristic
- **Management**: #FF9800 (orange) - leadership, warmth
- **Career**: #4CAF50 (green) - growth, opportunity
- **Processes**: #2196F3 (blue) - structure, reliability
- **Soft Skills**: #009688 (teal) - human, empathy
- **Interviews**: #F44336 (red) - stress, importance
- **Other**: #9E9E9E (gray) - neutral

### Typography
- **Topic names**: Bold, 16-20px
- **Percentages**: Regular, 14-18px, monospace
- **Descriptions**: Regular, 14px

### Spacing
- Section padding: 60px vertical
- Card gaps: 20px
- Element margins: 16px

---

### Key Takeaways Section
**Position**: End of page

**Title**: "Основные Выводы"

**Bullet Points**:
- 🤖 AI & ML = 976 упоминаний (№1 тема)
- 🧪 Testing & QA = 940 упоминаний (№2 тема)
- 👔 Management = 499 упоминаний
- 🤝 HR & Hiring = 482 упоминаний
- 💻 Frontend (JS/TS) = 227 упоминаний
- 🏗️ Architecture = 270 упоминаний
- 🔒 Security = всего 97 упоминаний (зона риска!)

---

## 🔗 Navigation

**Previous**: [← People](./people.md)
**Next**: [Sentiment →](./sentiment.md)
**Related**: [Insights](./insights.md) - что темы говорят о будущем

---

## 🔍 Topic Explorer Tool
**Position**: Sidebar or floating panel

**Interactive Filter Panel**:
```
🔍 Topic Explorer

Select Topic:
☐ AI & ML
☐ Management
☐ Career
☐ Processes
☐ Soft Skills
☐ Interviews

Date Range:
[Jan 2024] ——— [Jan 2025]

Sentiment Filter:
○ All
○ Positive only
○ Negative only
○ Neutral only
○ Questions only

[Apply Filters]
[Reset]

Showing: 4,287 messages
```

**Behavior**:
- Desktop: Sticky sidebar on right
- Mobile: Floating button (tap to expand)
- Filter changes: Update all visualizations in real-time

---

**Created**: December 26, 2025
**Data Source**: messages_export.csv, topic_evolution.csv
**Topics Analyzed**: 6 main categories, 23,426 messages
