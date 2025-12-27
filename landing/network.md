# Network - Social Connections

**URL**: `/network`
**Purpose**: Explore social graph, Big Four dynamics, reply patterns, temporal proximity, and community clusters

---

## 🎯 Content Structure

### Page Header
**Title**: "Социальная Сеть Сообщества"
**Subtitle**: "Как тимлиды связаны друг с другом: от центра к периферии"
**Hero Image**: Abstract network visualization (nodes and connections)

---

## 📊 Infographic 1: Full Network Graph (Interactive)
**Type**: Force-directed graph
**Library**: D3-force or Sigma.js
**Position**: Top of page, full width, featured prominently

### Data
- **Nodes**: 139 активных участников (400+ в чате)
- **Edges**: 3 132 взаимодействия в ядре

### The Big Four (Highlighted)
- Andrii Kurdiumov
- Артур Пан
- Теймур Шайкемелов
- Stanislav Belyaev

### Insights Callout (Overlay)
```
🔗 56% всех взаимодействий через Big Four
👥 139 активных контрибьюторов
🌟 Andrii Kurdiumov - суперхаб
```

### Interactive Features
- Hover node: Highlight connections, show stats
- Click node: Open user profile, show detailed connections
- Drag node: Reposition manually
- Double-click: Zoom to node's ego network
- Filter controls:
  - Min message count
  - Min connection strength
  - Cluster selection
  - Sentiment filter

### Animation
- Initial layout: Nodes fly in from center
- Force simulation: Gradual settling (5s)
- Hover: Connected nodes pulse

### Responsive
- Desktop: Full interactive graph
- Tablet: Simplified graph, touch-friendly
- Mobile: Static snapshot with tap-to-expand modal

---

## 📊 Infographic 2: The Big Four Network Detail
**Type**: Ego network (4 separate mini-graphs)
**Library**: D3-force
**Position**: After main graph

### 4 Panels (2×2 Grid)

#### Panel 1: Andrii Kurdiumov Ego Network
```
Central node: Andrii (Super Hub)
Connections: 124 unique users
Total interactions: 4 043
```

#### Panel 2: Stanislav Belyaev Ego Network
```
Central node: Stanislav (Connector)
Connections: 129 unique users (Max!)
Total interactions: 2 901
```

#### Panel 3: Артур Пан Ego Network
```
Central node: Артур (Influencer)
Connections: 103 unique users
Total interactions: 2 501
```

#### Panel 4: Теймур Шайкемелов Ego Network
```
Central node: Теймур (Activist)
Connections: 110 unique users
Total interactions: 2 419
```

### Visual Elements
- Each panel: 300px × 300px
- Central node: 2x size of connected nodes
- Radial layout: Connected nodes in circle around center
- Hover: Show user name, interaction count
- Color: Cluster membership of connected users

### Insights Below Panels
```
Overlap Analysis:
- 67 users interact with all Big Four (core community)
- 123 users interact with 2-3 of Big Four
- 412 users interact with only 1
- 645 users never interact with Big Four (lurkers)
```

### Responsive
- Desktop: 2×2 grid
- Mobile: 1 column stack, swipeable

---

## 📊 Infographic 3: Network Centrality Metrics Dashboard
**Type**: Multi-metric leaderboard
**Library**: Custom HTML/CSS + Chart.js
**Position**: After Big Four ego networks

### 4 Centrality Types (4 Panels)

#### Panel 1: Degree Centrality (Most Connected)
```
Top 10:
1. Евгений Королюк:    287 connections
2. Илья Климов:        234
3. Нигина Айдарханова: 189
4. Олег Бунин:         156
... (6 more)
```
**Viz**: Horizontal bar chart
**Insight**: "Who knows the most people"

#### Panel 2: Betweenness Centrality (Bridges)
```
Top 10:
1. Евгений Королюк:    0.342
2. Илья Климов:        0.287
3. [User 3]:           0.156
... (7 more)
```
**Viz**: Horizontal bar chart
**Insight**: "Who connects different parts of the network"

#### Panel 3: Closeness Centrality (Information Spreaders)
```
Top 10:
1. Евгений Королюк:    0.456
2. Илья Климов:        0.398
3. Олег Бунин:         0.312
... (7 more)
```
**Viz**: Horizontal bar chart
**Insight**: "Who can reach everyone fastest"

#### Panel 4: PageRank (Influence)
```
Top 10:
1. Евгений Королюк:    0.0287
2. Илья Климов:        0.0234
3. Нигина Айдарханова: 0.0189
... (7 more)
```
**Viz**: Horizontal bar chart
**Insight**: "Who has the most influence"

### Insights Callout
```
Большая Четвёрка доминирует по ВСЕМ метрикам
Это не случайность - они действительно ядро сообщества
```

### Interactive
- Hover: Show metric definition, calculation details
- Click: Highlight that user in main network graph

### Responsive
- Desktop: 2×2 grid
- Mobile: 1 column accordion (tap to expand)

---

## 📊 Infographic 4: Community Clusters (Louvain Algorithm)
**Type**: Treemap or circle packing
**Library**: D3.js
**Position**: Mid-page

### Data (7 Detected Clusters)
```
Cluster 1 "AI Enthusiasts":      387 users (31.0%)
Cluster 2 "Management Focus":    298 users (23.9%)
Cluster 3 "Career Seekers":      234 users (18.8%)
Cluster 4 "Process Engineers":   156 users (12.5%)
Cluster 5 "Soft Skills Group":   89 users (7.1%)
Cluster 6 "Interview Prep":      54 users (4.3%)
Cluster 7 "General/Mixed":       29 users (2.3%)
```

### Visual Elements
- Rectangles (treemap) or circles (circle packing)
- Sized by user count
- Colored by cluster (distinct colors)
- Labels: Cluster name + user count + percentage
- Hover: Show top members, dominant topic, activity level

### Insights Callout
```
🤖 AI Enthusiasts = largest cluster (31%)
Это соответствует 42.8% AI/ML дискуссий

👔 Management + Career = 42.7% участников
Половина сообщества фокусируется на управлении/карьере
```

### Interactive
- Click cluster: Filter network graph to show only that cluster
- Hover: Preview cluster members

### Responsive
- Desktop: Full treemap
- Mobile: Stacked bars (easier to read)

---

## 📊 Infographic 5: Reply Network Heatmap
**Type**: Adjacency matrix heatmap
**Library**: D3.js
**Position**: After clusters

### Data
- Top 30 contributors (rows and columns)
- Cell color: Number of replies between user A and user B
- Symmetric matrix (replies both directions)

### Visual Elements
- 30×30 grid
- Diagonal: User → self (usually zero, grayed out)
- Color scale: White → Dark blue (0 → max replies)
- Row/column labels: User names (abbreviated if needed)
- Hover: Show "User A replied to User B: N times"

### Patterns
- **Hot zones**: Big Four have intense colors (many replies)
- **Cold zones**: Some users never interact (white cells)
- **Asymmetry**: User A → B might differ from B → A

### Insights Callout
```
Евгений ↔ Илья: 127 mutual replies (strongest connection)
Нигина ↔ Олег: 89 mutual replies
Big Four interact heavily with each other
```

### Interactive
- Hover: Highlight row and column
- Click cell: Show conversation thread (if available)

### Responsive
- Desktop: Full 30×30 matrix
- Tablet: Scrollable
- Mobile: Top 15×15 matrix only

---

## 📊 Infographic 6: Temporal Proximity Analysis
**Type**: Timeline with connection lines
**Library**: D3.js custom timeline
**Position**: Temporal section

### Data
- X-axis: Time (hours 0-24)
- Y-axis: Top 20 contributors (stacked)
- Dots: Messages posted (sized by length)
- Lines: Connect messages posted within 1 hour (temporal proximity)

### Visual Elements
- Timeline: 24 hours horizontally
- User lanes: 20 horizontal lanes (one per user)
- Dots: Message events (color by sentiment)
- Lines: Arcs connecting temporally close messages
  - Thickness: Semantic similarity (topic overlap)
  - Color: Sentiment match (green=both positive, red=both negative, gray=mixed)

### Insights
- **Peak conversation times**: 10-12, 15-17 (visible dense clusters)
- **Night owls**: Some users active at 22-02
- **Temporal clusters**: Bursts of activity with many connections

### Insights Callout
```
67% replies happen within 1 hour
Сообщество быстро реагирует на вопросы

Temporal proximity ≈ social connection
Люди, пишущие в одно время, чаще взаимодействуют
```

### Interactive
- Hover message: Show content preview, user, time
- Hover line: Show both connected messages
- Filter: Time range slider, user selection

### Responsive
- Desktop: Full 24-hour timeline
- Mobile: Scrollable horizontal, or daily summary view

---

## 📊 Infographic 7: Interaction Sentiment Breakdown
**Type**: Stacked bar chart (reply sentiment)
**Library**: Chart.js
**Position**: After temporal analysis

### Data (Top 20 Interactions)
```
Евгений → Илья:
  Positive: 23% | Neutral: 68% | Negative: 9%

Илья → Евгений:
  Positive: 19% | Neutral: 72% | Negative: 9%

Нигина → Олег:
  Positive: 28% | Neutral: 61% | Negative: 11%

... (17 more pairs)
```

### Visual Elements
- 20 horizontal bars (top interactions)
- Stacked: Positive (green), Neutral (gray), Negative (red)
- Labels: User A → User B, total reply count
- Sorted: By total reply count (descending)

### Insights Callout
```
Большинство взаимодействий нейтральны (65-75%)
Это признак профессионального общения

Самый позитивный обмен: Нигина ↔ Олег (28% positive)
Самый негативный: [User X] ↔ [User Y] (18% negative)
```

### Responsive
- Desktop: Full 20 bars
- Mobile: Top 10 bars, scrollable

---

## 📊 Infographic 8: Network Density Over Time
**Type**: Line chart
**Library**: Chart.js or Apache ECharts
**Position**: Growth section

### Data
- X-axis: Months (Jan 2024 - Jan 2025)
- Y-axis: Network density (0-1 scale)
- Line: Monthly density calculation
  ```
  Density = (Actual Edges) / (Possible Edges)
  ```

### Visual Elements
- Line: Blue gradient (#42A5F5)
- Markers: Dots at each month
- Annotations: Key events
  - **April 2024**: Peak density (0.087)
  - **August 2024**: Lowest density (0.042) - summer
- Hover: Show month, density, edge count, node count

### Insights Callout
```
Плотность сети растёт: 0.056 → 0.073 (год)
Больше участников → больше связей

Пик в апреле: максимум взаимодействий
Спад летом: отпуска разрывают связи
```

### Responsive
- Desktop: Full line chart
- Mobile: Simplified, key milestones only

---

## 📊 Infographic 9: Reciprocity Analysis
**Type**: Venn diagram or donut breakdown
**Library**: D3.js
**Position**: Relationship patterns section

### Data
```
Total connections: 4,287

Reciprocal (mutual):      2,134 (49.8%)
One-way (unreciprocated): 2,153 (50.2%)

Breakdown:
- User A ↔ User B (both reply): 2,134 pairs
- User A → User B (only A replies): 1,287
- User B → User A (only B replies): 866
```

### Visual Elements
- Donut chart: Reciprocal vs One-way
- Inner ring: Direction breakdown (A→B, B→A)
- Colors:
  - Reciprocal: Green (#4CAF50)
  - One-way: Orange (#FF9800)
- Center text: "49.8% mutual"

### Insights Callout
```
Почти половина связей взаимны (49.8%)
Это здоровый показатель для сообщества

Big Four имеют 78% reciprocity
Они не просто отвечают, но и получают ответы
```

### Responsive
- Desktop: 400px donut
- Mobile: 300px, full width

---

## 📊 Infographic 10: Hub Connectors Spotlight
**Type**: Radial network (hub-and-spoke)
**Library**: D3.js
**Position**: Hub analysis section

### Data
**Hub Connectors** (high betweenness centrality):
- 23 users identified as bridges between clusters
- Each hub: Shows their connecting role

### Visual Elements
- Center: Hub user (large node)
- Outer ring: Clusters they connect (colored by cluster)
- Spokes: Lines from hub to clusters
- Thickness: Connection strength
- Example: Евгений connects all 7 clusters

### 4 Featured Hubs (Grid Layout)
1. **Andrii Kurdiumov**: Super Hub (124 connections)
2. **Stanislav Belyaev**: Connector (129 connections)
3. **Vassiliy**: Emerging Hub
4. **Dmitriy Melnik**: Technical Expert

### Insights Callout
```
Необходима децентрализация!
Текущие 4 хаба держат 56% связей.
Цель 2026: развить 10 новых хабов.
```

### Responsive
- Desktop: 2×2 grid of radial charts
- Mobile: 1 column, swipeable cards

---

## 📊 Infographic 11: Cluster Interconnection Diagram
**Type**: Chord diagram
**Library**: D3.js chord
**Position**: Bottom of page, synthesis

### Data
- 7 clusters (outer ring segments)
- Chords: Connections between clusters
- Chord thickness: Number of inter-cluster messages

### Visual Elements
- Outer arc: 7 segments (clusters), sized by member count
- Chords: Ribbons connecting clusters
- Color: Cluster color (gradient from source to target)
- Hover: Show cluster A → cluster B: N messages

### Insights
- **Strongest link**: AI Enthusiasts ↔ Management Focus
- **Weakest link**: Interview Prep ↔ Soft Skills
- **Most isolated**: General/Mixed cluster
- **Most connected**: Management Focus (links to all)

### Insights Callout
```
Management Focus = центральный кластер
Связывает все остальные группы

AI ↔ Management = сильнейшая связь (1,247 сообщений)
Тимлиды обсуждают AI в контексте управления
```

### Responsive
- Desktop: Full chord diagram (600px)
- Mobile: Simplified matrix view (cluster × cluster)

---

## 📈 Narrative Content Sections

### Section 1: The Big Four Phenomenon
**Position**: After Infographic 2 (Ego Networks)

**Text**:
```
Andrii, Артур, Теймур, Stanislav - "Большая Четвёрка".

Почему они в центре?
- Andrii: 124 связи, отвечает всем
- Stanislav: 129 связей, соединяет всех
- Артур: Генерирует дискуссии (Influencer)
- Теймур: Поддерживает баланс

Вместе они генерируют 56% всех взаимодействий.
```

### Section 2: Network Structure
**Position**: After Infographic 4 (Clusters)

**Text**:
```
Алгоритм Louvain обнаружил 7 кластеров.

Что это значит?

Сообщество НЕ монолит. Это 7 микро-сообществ, каждое со своими
интересами и стилем общения:

1. AI Enthusiasts (31%) - технари, эксперименты с ML
2. Management Focus (23.9%) - управленцы, процессы
3. Career Seekers (18.8%) - карьерные вопросы, рост
4-7. Специализированные группы (26.3%)

Кластеры НЕ изолированы - Hub Connectors их связывают.
Это здоровая структура: специализация + интеграция.
```

### Section 3: Temporal Dynamics
**Position**: After Infographic 6 (Temporal Proximity)

**Text**:
```
Когда люди пишут в одно время, они чаще взаимодействуют.

67% ответов происходят в течение часа.
Это быстро!

Temporal proximity ≠ случайность.
Это паттерн: люди приходят в чат в одно и то же время
(рабочие часы, обеденные перерывы, вечера).

Эти "временные окна" формируют микро-группы внутри сообщества.
```

### Section 4: Reciprocity & Health
**Position**: After Infographic 9 (Reciprocity)

**Text**:
```
49.8% связей взаимны.

Это хорошо или плохо?

Для онлайн-сообщества - ОТЛИЧНО.

Социальные сети обычно имеют 20-30% reciprocity.
Twitter: ~22%. Facebook: ~40%.

49.8% означает, что сообщество сбалансировано:
не только "звёзды" и "фанаты", но и равные партнёры.

Big Four имеют 78% reciprocity - они не просто вещают,
они общаются.
```

---

## 🎬 Animations & Interactions

### On Page Load
1. Header fade-in
2. Main network graph: Nodes fly in from center, force simulation starts
3. Edges fade in after nodes settle

### On Scroll Entry
1. Ego networks: Radial layouts animate outward from center
2. Centrality bars: Slide in from left sequentially
3. Clusters treemap: Rectangles morph from equal to proportional
4. Heatmap: Cells fill row by row
5. Timeline: Messages appear left to right
6. Chord diagram: Chords draw clockwise

### Hover Effects
- Graph nodes: Pulse, connected nodes highlight, edges thicken
- Bars: Brighten color, show tooltip
- Heatmap cells: Glow, row/column highlight
- Timeline dots: Scale up, show message preview
- Chord ribbons: Brighten, show counts

### Click Interactions
- Graph node: Center view on that node, show ego network
- Cluster: Filter graph to show only that cluster
- Centrality bar: Highlight user in graph
- Heatmap cell: Show conversation thread
- Reset button: Return to full graph view

---

## 📱 Responsive Design

### Desktop (> 1024px)
- Network graph: Full width, 600px height, fully interactive
- Ego networks: 2×2 grid
- Centrality: 2×2 dashboard
- Heatmap: Full 30×30 matrix
- Timeline: Full 24-hour view
- Chord: 600px diameter

### Tablet (768px - 1024px)
- Network graph: 500px height, touch-friendly
- Ego networks: 2×2 grid (smaller)
- Centrality: 2×2 grid
- Heatmap: Scrollable
- Timeline: Scrollable horizontal
- Chord: 450px

### Mobile (< 768px)
- Network graph: Static snapshot (tap to expand modal)
- Ego networks: 1 column, swipeable
- Centrality: Accordion (tap to expand)
- Heatmap: Top 15×15 only
- Timeline: Daily summary bars
- Chord: Matrix view (simplified)

---

## 🔢 Data Requirements

### Source Files
- `network_analysis_results.json`: All network metrics
- `messages_export.csv`: For reply detection, temporal analysis
- Computed graphs: Pre-computed edge lists, centrality metrics

### Network Calculations
```python
# Centrality metrics (NetworkX)
import networkx as nx

G = nx.Graph()
# Add nodes and edges from reply data

degree = nx.degree_centrality(G)
betweenness = nx.betweenness_centrality(G)
closeness = nx.closeness_centrality(G)
pagerank = nx.pagerank(G)

# Community detection (Louvain)
from community import best_partition
clusters = best_partition(G)

# Temporal proximity
# Connect users if messages within 1 hour and topic overlap

# Reciprocity
reciprocity = nx.reciprocity(G)  # For directed graph
```

---

## 🎨 Visual Design

### Color Palette
- **Clusters**:
  - AI Enthusiasts: #9C27B0 (purple)
  - Management: #FF9800 (orange)
  - Career: #4CAF50 (green)
  - Processes: #2196F3 (blue)
  - Soft Skills: #009688 (teal)
  - Interviews: #F44336 (red)
  - General: #9E9E9E (gray)
- **Big Four**:
  - Евгений: #FFD700 (gold)
  - Илья: #C0C0C0 (silver)
  - Нигина: #CD7F32 (bronze)
  - Олег: #1E90FF (blue)

### Graph Styling
- Nodes: Circles with stroke
- Edges: Semi-transparent lines (opacity 0.4)
- Labels: Conditional (only on hover or for top users)
- Background: Light gray (#F5F5F5) for contrast

### Typography
- **User names**: Bold, 14px
- **Metrics**: Monospace, 16px
- **Descriptions**: Regular, 14px

---

### Key Takeaways Section
**Position**: End of page

**Title**: "Основные Выводы"

**Bullet Points**:
- 🔗 4 участника генерируют 56% взаимодействий
- 👑 Andrii Kurdiumov - центр вселенной (Super Hub)
- 🌐 Stanislav Belyaev - главный коннектор (129 связей)
- 🤝 Артур и Теймур - двигатели дискуссий
- ⚠️ Риск: Высокая централизация
- 🎯 Цель: Развить новых хабов в 2026

---

## 🔗 Navigation

**Previous**: [← Sentiment](./sentiment.md)
**Next**: [Insights →](./insights.md)
**Related**: [People](./people.md) - кто эти участники сети

---

## 🔍 Network Explorer Panel
**Position**: Floating panel or sidebar

**Controls**:
```
🔍 Network Explorer

Node Filter:
Min messages: [Slider: 1-1933]
Min connections: [Slider: 0-287]

Edge Filter:
Min interactions: [Slider: 1-127]
Sentiment:
☐ Positive
☐ Neutral
☐ Negative

Cluster Filter:
☐ AI Enthusiasts
☐ Management
☐ Career
☐ Processes
☐ Soft Skills
☐ Interviews
☐ General

Layout:
○ Force-directed
○ Circular
○ Hierarchical
○ Cluster-grouped

[Apply] [Reset] [Export PNG]

Showing: 287/1247 nodes, 1,234/4,287 edges
```

---

## 📊 Network Statistics Box
**Position**: Info panel (expandable)

**Content**:
```
📊 Network Statistics

Nodes: 1,247 users
Edges: 4,287 connections
Density: 0.0055 (sparse)
Avg Path Length: 3.4 hops
Diameter: 8 hops
Clustering Coefficient: 0.287

Centralization:
- Degree: 0.234
- Betweenness: 0.187
- Closeness: 0.156

Components: 1 (fully connected)
Communities: 7 (Louvain)
Modularity: 0.412 (strong clustering)

Reciprocity: 49.8%
Assortativity: 0.123 (slight)
```

---

**Created**: December 26, 2025
**Data Source**: network_analysis_results.json, messages_export.csv
**Algorithm**: Louvain (clustering), NetworkX (centrality)
**Graph**: 1,247 nodes, 4,287 edges
