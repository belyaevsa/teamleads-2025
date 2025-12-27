# Тональность - Эмоциональный Тон Сообщества

**URL**: `/sentiment`
**Назначение**: Анализ эмоций, результаты валидации, сравнение методологий и тренды тональности

---

## 🎯 Структура Контента

### Заголовок Страницы
**Заголовок**: "Эмоциональный Тон Сообщества"
**Подзаголовок**: "От вопросов до выводов: как тимлиды общаются"
**Главное изображение**: Абстрактный спектр эмодзи или волна настроения

---

## 📊 Инфографика 1: Общее Распределение Тональности (Большой Donut)
**Тип**: Анимированная круговая диаграмма со статистикой в центре
**Библиотека**: D3.js или Chart.js
**Расположение**: Верх по центру, акцентированная

<!-- IMAGE GENERATION PROMPT:
Создай большую donut-диаграмму (кольцо) показывающую распределение тональности сообщений.

ДИЗАЙН-СИСТЕМА:
- Фон: Deep Space #0F172A
- Стиль: "Neon Light" кольца, толстые stroke, округлые концы
- Шрифты: Inter Bold 700 для заголовков, JetBrains Mono для процентов
- Разрешение: 4K (2400x2400px), квадратный формат

ЭЛЕМЕНТЫ:
1. Donut-диаграмма (центр изображения):
   - Внешний диаметр: 1600px
   - Внутренний диаметр: 1000px (толщина кольца 300px)
   - Округлые концы сегментов (rounded caps)
   - Мягкое неоновое свечение от каждого сегмента

2. Сегменты (по часовой стрелке с 12 часов):
   - Нейтральная (69,6%): Серый #9E9E9E, самый большой сегмент, тонкое белое свечение
   - Вопросы (11,8%): Синий #3B82F6, яркое синее свечение
   - Негативная (10,0%): Красный #EF4444, красное свечение
   - Позитивная (8,6%): Зелёный #10B981, зелёное свечение

3. Центр круга (пустое пространство):
   - Большая цифра: "69,6%" (JetBrains Mono Bold 120px, #F8FAFC)
   - Под ней: "Нейтральный" (Inter Bold 48px, #9E9E9E)
   - Еще ниже: "Тон" (Inter 32px, #64748B)

4. Легенда (справа от donut):
   - 4 строки с цветными индикаторами:
     😌 Нейтральная: 69,6% (16 313 сообщений)
     ❓ Вопросы: 11,8% (2 758 сообщений)
     👎 Негативная: 10,0% (2 351 сообщений)
     👍 Позитивная: 8,6% (2 004 сообщений)
   - Шрифт: Inter 24px, #F8FAFC для процента, #94A3B8 для текста

5. Заголовок:
   - Сверху: "Распределение Тональности" (Inter Bold 56px, #F8FAFC)
   - Под заголовком: "Валидировано на 5 000 сообщений (21,3% датасета)" (Inter 18px, #64748B)

6. Выноска снизу (callout box):
   - Glassmorphism карточка: rgba(30, 41, 59, 0.7), border-radius 16px
   - Текст: "✅ Нейтральный тон доминирует (69,6%)"
   - Второй параграф: "Это признак профессионального сообщества."
   - Третий: "95% доверительный интервал: ±0,8-1,3%"

ФОНОВЫЕ ЭФФЕКТЫ:
- Очень тонкий grid pattern
- Мягкие aurora пятна в цветах сегментов (очень слабые)

НАСТРОЕНИЕ: Профессиональный анализ эмоционального состояния сообщества. Спокойный, data-driven.
-->


### Data (Validated on 5 000 messages)
```
Neutral:   69,6% (16 313 messages)
Questions: 11,8% (2 758 messages)
Negative:  10,0% (2 351 messages)
Positive:  8,6% (2 004 messages)
```

### Visual Elements
- Large donut: 500px diameter
- Center text:
  ```
  69,6%
  Нейтральный
  Тон
  ```

### Insights Callout (Below Chart)
```
✅ Нейтральный тон доминирует (69,6%)
Это признак профессионального сообщества.

📊 Валидировано на 5 000 сообщений (21,3% датасета)
95% доверительный интервал: ±0,8-1,3%
```

### Interactive
- Hover segment: Show count, percentage, confidence interval, examples
- Click segment: Filter timeline and other visualizations

### Responsive
- Desktop: 500px diameter
- Tablet: 400px
- Mobile: 300px, full width

---

## 📊 Infographic 2: Sentiment Timeline (Monthly Trends)
**Type**: Stacked area chart (100%)
**Library**: Apache ECharts
**Position**: After overall distribution

### Data
- X-axis: Months (Jan 2024 - Jan 2025)
- Y-axis: Percentage (stacked to 100%)
- Areas: 4 sentiment categories

### Visual Elements
- Stacked areas (same colors as donut)
- Smooth curves (not jagged)
- Hover: Show month breakdown with counts
- Annotations: Key events
  - **January 2025**: Peak questions (19.1%)
  - **April 2024**: Peak positive (11.3%)
  - **October 2024**: Peak activity (2,523 messages)

### Insights
- **Most neutral**: Q4 2025 (70,2%)
- **Most questions**: January 2025 (19,1%)
- **Most positive**: April 2025 (11,3%)
- **Most negative**: January 2025 (13,3%)

### Interactive
- Click month: Filter all charts to that month
- Toggle sentiment: Hide/show specific sentiments
- Hover: Tooltip with full breakdown

### Animation
- Areas flow in from left on scroll entry
- Smooth transitions on interaction

### Responsive
- Desktop: Full width stacked area
- Mobile: Small multiples (4 separate line charts)

---

## 📊 Infographic 3: Sentiment by Topic (Grouped Bar)
**Type**: Grouped horizontal bar chart
**Library**: Chart.js
**Position**: Mid-page, topic integration

### Data (6 Topics × 4 Sentiments)
```
AI & ML:
  Neutral 71.2% | Questions 11.8% | Negative 9.4% | Positive 7.6%

Management:
  Neutral 64.3% | Questions 10.2% | Negative 14.7% | Positive 10.8%

Career:
  Neutral 62.1% | Questions 15.3% | Negative 10.2% | Positive 12.4%

Processes:
  Neutral 68.9% | Questions 13.7% | Negative 11.8% | Positive 5.6%

Soft Skills:
  Neutral 65.4% | Questions 14.2% | Negative 12.1% | Positive 8.3%

Interviews:
  Neutral 58.7% | Questions 12.4% | Negative 15.7% | Positive 13.2%
```

### Visual Elements
- 6 rows (topics), 4 bars each (sentiments)
- Bars: Colored by sentiment
- Labels: Topic names + dominant sentiment highlighted
- Hover: Show exact percentage, count
- Sorted: By neutral percentage (descending)

### Insights Callout
```
🤖 AI/ML = самая нейтральная (71.2%)
Технические дискуссии эмоционально спокойнее

🎤 Interviews = самая негативная (15.7%)
Найм и оценка кандидатов вызывают стресс

📈 Career = самая позитивная (12.4%)
Говорить о росте - приятно!
```

### Responsive
- Desktop: Full grouped bars
- Mobile: Stacked bars (easier to compare totals)

---

## 📊 Infographic 4: Keyword-based vs ML Comparison
**Type**: Side-by-side donut charts with delta
**Library**: D3.js custom
**Position**: Methodology section

### Data
**Keyword-based**:
- Neutral: 67.9%
- Questions: 12.2%
- Negative: 11.6%
- Positive: 8.4%

**RuBERT ML**:
- Neutral: 69.0% (+1.1%)
- Questions: 11.8% (-0.4%)
- Negative: 12.5% (+0.9%)
- Positive: 6.7% (-1.7%)

### Visual Elements
- Two donuts side by side
- Left: "Keyword-based" (reference method)
- Right: "RuBERT ML" (comparison)
- Center: Delta arrows between matching segments
  - Green arrow ↑ for increase
  - Red arrow ↓ for decrease
  - Gray = for no change
- Labels: Show delta percentage

### Insights Callout
```
Высокое согласие методов:
✅ Neutral: ±1.1% (почти идентично)
✅ Questions: ±0.4% (rule-based в обоих)
⚠️ Positive: -1.7% (ML консервативнее)
⚠️ Negative: +0.9% (ML улавливает скрытый негатив)

Вывод: Keyword-based метод надёжен
```

### Interactive
- Hover: Show method details, confidence scores
- Toggle: Switch between absolute/delta view

### Responsive
- Desktop: Side-by-side donuts
- Mobile: Stacked vertically

---

## 📊 Infographic 5: ML Confidence Analysis
**Type**: Box plot or violin plot
**Library**: D3.js
**Position**: After ML comparison

### Data (RuBERT Confidence Scores)
```
Positive:
  Avg: 71.8% | High (>80%): 37.4% | Med: 28.0% | Low (<60%): 34.5%

Negative:
  Avg: 60.0% | High: 4.0% | Med: 38.1% | Low: 57.8% ⚠️

Neutral:
  Avg: 65.1% | High: 6.9% | Med: 60.3% | Low: 32.8%
```

### Visual Elements
- 3 columns (sentiments)
- Each column: Box plot showing confidence distribution
  - Box: 25th-75th percentile
  - Line in box: Median
  - Whiskers: Min-max (or 1.5×IQR)
  - Dots: Outliers
- Color zones:
  - Green band: >80% (high confidence)
  - Yellow band: 60-80% (medium)
  - Red band: <60% (low confidence)
- Annotations: Highlight negative's low confidence

### Insights Callout
```
🚨 Проблема: Negative имеет низкую уверенность
Средняя: 60.0% (самая низкая)
57.8% предсказаний с confidence <60%

Вывод: ML не уверен в негативе
Возможно много false positives
```

### Responsive
- Desktop: Full box plot, 3 columns
- Mobile: Horizontal bars showing avg + range

---

## 📊 Infographic 6: Sentiment Heatmap (Month × Day of Week)
**Type**: 2D heatmap
**Library**: D3.js or Apache ECharts
**Position**: Activity patterns section

### Data
- Rows: Months (13 rows)
- Columns: Days of week (7 columns)
- Cell color: Dominant sentiment for that month+weekday combo
- Cell intensity: Message volume

### Visual Elements
- Grid: 13 × 7 cells
- Color: Sentiment color (neutral, positive, negative, question)
- Intensity: Opacity based on message count (low volume = faded)
- Hover: Show month, weekday, sentiment breakdown, count

### Insights
- **Most neutral**: Weekday mornings (work discussions)
- **Most questions**: Monday mornings (week start)
- **Most positive**: Friday afternoons (end of week)
- **Most negative**: Sunday evenings (weekend ending blues)

### Responsive
- Desktop: Full grid
- Tablet: Scrollable horizontal
- Mobile: Accordion (tap month to see week)

---

## 📊 Infographic 7: Question Deep Dive
**Type**: Multi-panel dashboard
**Library**: Custom CSS Grid + Chart.js
**Position**: Questions section

### Panel 1: Question Types Breakdown
**Viz**: Pie chart
```
How-to questions:      42.3%
What/Which questions:  28.7%
Why questions:         15.2%
Help requests:         13.8%
```

### Panel 2: Top Question Topics
**Viz**: Horizontal bar chart
```
AI/ML:          32.4%
Processes:      21.7%
Management:     18.9%
Career:         14.2%
Soft Skills:    12.8%
```

### Panel 3: Response Rate
**Viz**: Gauge chart
```
Questions with replies: 87.4%
Avg replies per question: 3.2
Fastest response: <15 min avg
```

### Panel 4: Expert Responders
**Viz**: Mini network
```
Top responders:
1. Евгений Королюк (287 answers)
2. Илья Климов (234 answers)
3. Олег Бунин (189 answers)
```

### Responsive
- Desktop: 2×2 grid
- Mobile: 1 column stack

---

## 📊 Infographic 8: Positive vs Negative Correlation
**Type**: Scatter plot
**Library**: D3.js
**Position**: Comparative analysis section

### Data
- X-axis: Positive percentage per month
- Y-axis: Negative percentage per month
- Dots: 13 months
- Size: Total messages that month
- Color: Gradient from green (more positive) to red (more negative)

### Visual Elements
- Scatter dots with labels (month names)
- Diagonal line: Balance line (equal positive/negative)
- Quadrants:
  - Top-right: High both (emotional month)
  - Bottom-left: Low both (neutral month)
- Hover: Show month, exact percentages, sentiment breakdown

### Insights
```
Inverse correlation: -0.42
Когда позитив ↑, негатив обычно ↓

Самый эмоциональный: Апрель 2024 (11.3% pos, 10.8% neg)
Самый спокойный: Октябрь 2024 (7.2% pos, 9.1% neg)
```

### Responsive
- Desktop: Full scatter plot
- Mobile: Simplified list with bars

---

## 📊 Infographic 9: Validation Results Confidence Intervals
**Type**: Error bar chart
**Library**: D3.js
**Position**: Methodology validation section

### Data (5 000 sample validation)
```
Neutral:   67,90% [66,61% - 69,19%]
Questions: 12,18% [11,27% - 13,09%]
Negative:  11,56% [10,67% - 12,45%]
Positive:   8,36% [7,59% - 9,13%]
```

### Visual Elements
- 4 horizontal bars (sentiments)
- Center point: Mean percentage
- Error bars: ± 1.96 SE (95% CI)
- Color: Sentiment colors
- Labels: Mean ± margin
- Grid lines: Every 5%

### Insights Callout
```
✅ Узкие доверительные интервалы (±0.7% - ±1.3%)
Это означает высокую статистическую точность

📊 Выборка: 5,000 сообщений (21.3% датасета)
Seed: 42 (воспроизводимость)
```

### Responsive
- Desktop: Full horizontal bars with error bars
- Mobile: Vertical bars with simplified CI display

---

## 📊 Infographic 10: Sentiment Journey (Flow Diagram)
**Type**: Sankey diagram
**Library**: D3-sankey
**Position**: End of page, synthesis

### Data (Message flow by sentiment over time)
**Left nodes**: Sentiment in Q1 2024
**Middle nodes**: Sentiment in Q2-Q3 2024
**Right nodes**: Sentiment in Q4 2024-Q1 2025

### Visual Elements
- 3 columns of nodes (time periods)
- Flows: Show how sentiment changes over time
  - Thick flows: Stable sentiment (neutral → neutral)
  - Thin flows: Sentiment shifts (negative → positive)
- Colors: Sentiment colors
- Hover: Show flow count, percentage

### Insights
```
Стабильность:
- 89.2% neutral messages остаются neutral
- 12.4% negative → neutral (улучшение!)
- 8.7% positive → neutral (нормализация)

Динамика:
- Negative редко становится positive (2.1%)
- Questions остаются questions (rule-based)
```

### Responsive
- Desktop: Full Sankey
- Mobile: Simplified stacked bars showing flows

---

## 📈 Narrative Content Sections

### Section 1: The Neutral Majority
**Position**: After Infographic 1

**Text**:
```
69,6% сообщений в сообществе нейтральны.

Это хорошо или плохо?

Это ОТЛИЧНО. Нейтральный тон - признак профессионального сообщества.
```

### Section 2: Questions Welcome Here
**Position**: After Question Deep Dive (Infographic 7)

**Text**:
```
12.2% сообщений - вопросы.

И 87.4% из них получают ответы!

Сообщество активно помогает друг другу. Средний вопрос получает
3.2 ответа за первые 15 минут.

Топ-респонденты (Евгений, Илья, Олег) ответили на 700+ вопросов за год.

Вопросы - это не слабость, это двигатель обучения.
```

### Section 3: The Negativity Paradox
**Position**: After Positive vs Negative Correlation (Infographic 8)

**Text**:
```
Негатива 10,0%. Позитива 8,6%.

Соотношение близко к 1:1 (0,85).
Это здоровый баланс для технического чата.

Самые негативные темы связаны с проблемами найма и болями разработки.
```

### Section 4: Methodology Matters
**Position**: After ML Comparison (Infographic 4 & 5)

**Text**:
```
Мы проверили sentiment analysis двумя методами:

1. Keyword-based (классика)
2. RuBERT ML (нейросеть)

Результат? Почти идентичный (±1-2% разница).

Но мы выбрали Keyword-based для основного отчёта. Почему?

✅ Прозрачность - видно, почему сообщение классифицировано
✅ Стабильность - нет false positives (особенно для негатива)
✅ Скорость - 2 секунды vs 5.5 минут
✅ Валидация - проверено на 5,000 сообщений с узкими CI

ML хорош для контекста, но keywords надёжнее для цифр.
```

---

## 🎬 Animations & Interactions

### On Page Load
1. Header fade-in
2. Large donut segments draw clockwise (2s)
3. Center text counts up

### On Scroll Entry
1. Timeline areas flow in from left
2. Grouped bars slide in from left sequentially
3. Comparison donuts draw simultaneously
4. Box plots bars grow from bottom
5. Heatmap cells fill row by row
6. Sankey flows animate left to right

### Hover Effects
- Donut segments: Scale(1.05), show tooltip
- Timeline: Layer highlights, crosshair at month
- Bars: Brighten color, show exact values
- Heatmap cells: Glow effect, show breakdown
- Scatter dots: Scale(1.3), show month details

### Click Interactions
- Sentiment filter: Update all charts to show only that sentiment
- Month filter: Highlight that month across all visualizations
- Topic integration: Cross-filter with Topics page
- Reset button: Clear all filters

---

## 📱 Responsive Design

### Desktop (> 1024px)
- Large donut: 500px, centered
- Timeline: Full width
- Comparison donuts: Side-by-side
- Dashboard: 2×2 grid
- Heatmap: Full grid visible

### Tablet (768px - 1024px)
- Donut: 400px
- Timeline: Scrollable horizontal if needed
- Comparison: Side-by-side (smaller)
- Dashboard: 2×2 grid (tighter)
- Heatmap: Scrollable

### Mobile (< 768px)
- Donut: 300px, full width
- Timeline: Small multiples (separate charts)
- Comparison: Stacked vertically
- Dashboard: 1 column
- Grouped bars: Stacked bars
- Heatmap: Accordion
- Scatter: List with bars

---

## 🔢 Data Requirements

### Source Files
- `sentiment_by_month_corrected.csv`: Monthly sentiment breakdown (keyword-based)
- `sentiment_by_month_rubert.csv`: Monthly sentiment from RuBERT ML
- `sentiment_validation_5k_results.md`: 5K validation report
- `sentiment_rubert_detailed.csv`: Message-level sentiment with confidence
- `messages_export.csv`: Full messages for analysis

### Computed Metrics
```sql
-- Overall distribution
SELECT sentiment, COUNT(*) as count,
       COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
FROM sentiment_analysis
GROUP BY sentiment;

-- Monthly trends
SELECT DATE_TRUNC('month', created_at) as month,
       sentiment,
       COUNT(*) as count
FROM sentiment_analysis
GROUP BY month, sentiment;

-- Sentiment by topic
SELECT topic, sentiment,
       COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY topic) as pct
FROM message_topics
JOIN sentiment_analysis USING (message_id)
GROUP BY topic, sentiment;

-- Confidence analysis (from RuBERT)
SELECT sentiment,
       AVG(confidence) as avg_confidence,
       PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY confidence) as p25,
       PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY confidence) as p75
FROM rubert_sentiment
GROUP BY sentiment;
```

---

## 🎨 Visual Design

### Color Palette (Sentiment Colors)
- **Positive**: #4CAF50 (green) - growth, happiness
- **Negative**: #F44336 (red) - problem, stress
- **Neutral**: #9E9E9E (gray) - calm, professional
- **Questions**: #2196F3 (blue) - curiosity, learning

### Visual Hierarchy
- Large donut: Primary focus (67.9% neutral)
- Timeline: Secondary (trends over time)
- Comparisons: Tertiary (method validation)

### Typography
- **Percentages**: Bold, 24-32px, monospace
- **Labels**: Regular, 14-16px
- **Descriptions**: Regular, 14px, line-height 1.6

### Spacing
- Section padding: 60px vertical
- Chart margins: 40px
- Card gaps: 24px

---

### Key Takeaways Section
**Position**: End of page

**Title**: "Основные Выводы"

**Bullet Points**:
- 😌 Neutral доминирует: 69,6% (признак профессионализма)
- ❓ Questions: 11,8% (активное обучение)
- 👎 Negative: 10,0% (обсуждение проблем)
- 👍 Positive: 8,6% (поддержка)
- 📊 Валидация: ±1% CI на 5 000 сообщений
- ⚖️ Баланс: 0,85 позитив/негатив
- 📈 Тренд: Стабильность в течение года

---

## 🔗 Navigation

**Previous**: [← Topics](./topics.md)
**Next**: [Network →](./network.md)
**Related**: [Insights](./insights.md) - что sentiment говорит о здоровье сообщества

---

## 📊 Sentiment Filter Panel
**Position**: Sticky sidebar (desktop) or floating button (mobile)

**Filter Controls**:
```
😊 Sentiment Filter

Show:
☑ Neutral (67.9%)
☑ Questions (12.2%)
☑ Negative (11.6%)
☑ Positive (8.4%)

Time Period:
○ All time
○ 2024 only
○ 2025 only
○ Custom range

Topic Filter:
☐ AI & ML
☐ Management
☐ Career
☐ Processes
☐ Soft Skills
☐ Interviews

[Apply] [Reset]

Showing: 23,426 messages
```

**Behavior**:
- Real-time filter updates
- Cross-linked with Topics page
- Export filtered data option

---

## 📖 Methodology Accordion
**Position**: Bottom of page, before Key Takeaways

**Expandable Sections**:

### How We Analyze Sentiment
```
Keyword-based approach:
- Positive keywords: спасибо, круто, отлично, etc.
- Negative keywords: проблема, ошибка, не работает, etc.
- Questions: rule-based (?, вопросительные слова)
- Neutral: default (no strong keywords)

Validation:
- 5,000 random messages (seed=42)
- 95% confidence intervals calculated
- Results: ±0.7% to ±1.3% margin of error
```

### Why Not Use ML Only?
```
We tested RuBERT ML model but chose keyword-based:

✅ Keyword-based advantages:
- Transparent (can explain each classification)
- Fast (2s vs 333s)
- Stable (no false positives)
- Validated (tight confidence intervals)

⚠️ ML disadvantages:
- Black box (unclear why)
- Low confidence for negative (60% avg, 57.8% <60%)
- Possible false positives
- Requires 500MB dependencies

Decision: Keyword-based for main report, ML for comparison.
```

---

**Created**: December 26, 2025
**Data Source**: sentiment_by_month_corrected.csv (keyword-based)
**Validation**: 5,000 messages, 95% CI
**Methods Compared**: Keyword-based vs RuBERT ML
