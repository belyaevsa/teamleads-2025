# Hugo Implementation Plan: Teamleads.kz Year in Review 2025

**Project**: Converting React/Vite template to Hugo static site
**Target**: `/docs/teamleads_kz/hugo`
**Created**: December 27, 2025
**Status**: Planning Phase

---

## Executive Summary

This plan outlines the step-by-step implementation of a static website using Hugo SSG based on:
- **Design system**: Modern glassmorphism, Bento Grid layout, tech-forward aesthetic
- **Template**: React/Vite application with Framer Motion animations and Recharts
- **Content**: 8 landing pages with 64+ infographics showcasing community analytics
- **Technology Stack**: Hugo + TailwindCSS + Alpine.js + Chart.js/D3.js

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture & Technology Stack](#2-architecture--technology-stack)
3. [Hugo Project Structure](#3-hugo-project-structure)
4. [Phase 1: Foundation Setup](#4-phase-1-foundation-setup)
5. [Phase 2: Design System Implementation](#5-phase-2-design-system-implementation)
6. [Phase 3: Layout & Components](#6-phase-3-layout--components)
7. [Phase 4: Page Development](#7-phase-4-page-development)
8. [Phase 5: Data Integration](#8-phase-5-data-integration)
9. [Phase 6: Animations & Interactivity](#9-phase-6-animations--interactivity)
10. [Phase 7: Optimization & Polish](#10-phase-7-optimization--polish)
11. [Deployment Strategy](#11-deployment-strategy)
12. [Testing & Quality Assurance](#12-testing--quality-assurance)
13. [Timeline & Milestones](#13-timeline--milestones)
14. [Risk Assessment](#14-risk-assessment)

---

## 1. Project Overview

### 1.1 Scope

Convert a React/Vite single-page application into a Hugo-based static multi-page website featuring:

- **8 main pages**: Homepage, Overview, People, Topics, Sentiment, Network, Insights, plus About
- **64+ interactive infographics**: Charts, heatmaps, network graphs, word clouds
- **Advanced animations**: Scroll-triggered reveals, count-ups, chart drawing
- **Responsive design**: Mobile-first, desktop-enhanced
- **Performance**: Lighthouse score > 90, FCP < 1.5s

### 1.2 Key Requirements

**Must Have**:
- All 8 content pages with specified infographics
- Design system faithful to design-system-2025.md
- Responsive layouts (mobile, tablet, desktop)
- Basic animations and interactions
- SEO optimization

**Should Have**:
- Advanced scroll animations
- Interactive chart filtering
- Dark mode toggle (already in design)
- Floating dock navigation
- Glassmorphism effects

**Nice to Have**:
- Page transitions
- Data export functionality
- Social sharing
- Print stylesheets

### 1.3 Out of Scope

- Real-time data updates (static data only)
- Backend API development
- User authentication
- Content Management System
- Multilingual support (Russian only for Phase 1)

---

## 2. Architecture & Technology Stack

### 2.1 Core Technologies

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **Hugo** | Static Site Generator | Fast builds, powerful templating, SEO-friendly |
| **TailwindCSS** | Styling Framework | Matches React template, utility-first, responsive |
| **Alpine.js** | JS Interactivity | Lightweight (15kb), declarative, Hugo-friendly |
| **Chart.js** | Standard Charts | Simple bar/line/donut charts, good performance |
| **D3.js** | Complex Visualizations | Network graphs, force layouts, custom viz |
| **Apache ECharts** | Advanced Charts | Heatmaps, streamgraphs, sankey diagrams |
| **GSAP** | Animations | Professional-grade scroll animations, count-ups |

### 2.2 Hugo vs React Mapping

| React Feature | Hugo Equivalent | Implementation Strategy |
|---------------|-----------------|-------------------------|
| React Components | Hugo Partials | Convert each `.tsx` component to a partial template |
| Framer Motion | GSAP + Alpine.js | Replicate animations with GSAP ScrollTrigger |
| React State | Alpine.js x-data | Use Alpine for interactive states |
| Recharts | Chart.js + D3.js | Port chart configs to JS initialization |
| React Router | Hugo Menus | Use Hugo's built-in navigation |
| CSS-in-JS | Tailwind + Custom CSS | Extract styles to Tailwind classes |

### 2.3 Build Pipeline

```
Content (Markdown) → Hugo Build → Static HTML/CSS/JS → Deploy
                          ↓
                    TailwindCSS Processing
                          ↓
                    Asset Minification
                          ↓
                    Image Optimization
```

---

## 3. Hugo Project Structure

```
docs/teamleads_kz/hugo/
├── archetypes/                 # Content templates
│   └── default.md
├── assets/                     # Source assets (processed by Hugo)
│   ├── css/
│   │   ├── main.css           # TailwindCSS entry point
│   │   └── components/        # Component-specific styles
│   ├── js/
│   │   ├── main.js            # Alpine.js initialization
│   │   ├── charts/            # Chart initialization scripts
│   │   │   ├── timeline.js
│   │   │   ├── heatmap.js
│   │   │   ├── network.js
│   │   │   └── ...
│   │   ├── animations.js      # GSAP scroll animations
│   │   └── lib/
│   │       └── designTokens.js # Port of React design tokens
│   └── images/
│       └── generated/          # AI-generated hero images
├── config/
│   ├── _default/
│   │   ├── config.toml        # Main config
│   │   ├── menus.toml         # Navigation
│   │   ├── params.toml        # Custom parameters
│   │   └── languages.toml     # Future multilingual
│   └── production/
│       └── config.toml        # Production overrides
├── content/
│   ├── _index.md              # Homepage
│   ├── overview.md            # Overview page
│   ├── people.md              # People page
│   ├── topics.md              # Topics page
│   ├── sentiment.md           # Sentiment page
│   ├── network.md             # Network page
│   ├── insights.md            # Insights page
│   └── about.md               # About the project
├── data/
│   ├── messages.json          # Pre-processed message data
│   ├── sentiment.json         # Sentiment data
│   ├── network.json           # Network analysis results
│   ├── topics.json            # Topic analysis
│   └── metrics.json           # Key metrics
├── layouts/
│   ├── _default/
│   │   ├── baseof.html        # Base template
│   │   ├── single.html        # Single page template
│   │   └── list.html          # List template (if needed)
│   ├── index.html             # Homepage template
│   ├── partials/
│   │   ├── head.html          # <head> section
│   │   ├── header.html        # Site header
│   │   ├── footer.html        # Site footer
│   │   ├── floating-dock.html # Navigation dock
│   │   ├── components/
│   │   │   ├── hero.html
│   │   │   ├── bento-card.html
│   │   │   ├── stat-display.html
│   │   │   ├── big-four.html
│   │   │   └── ...
│   │   └── infographics/
│   │       ├── timeline.html
│   │       ├── heatmap.html
│   │       ├── wordcloud.html
│   │       ├── network-graph.html
│   │       └── ...
│   └── shortcodes/            # Reusable content blocks
│       ├── infographic.html   # Generic infographic wrapper
│       ├── callout.html       # Insight callouts
│       └── stat-card.html     # Metric cards
├── static/
│   ├── fonts/                 # Inter, JetBrains Mono
│   ├── lib/                   # Third-party JS libraries
│   │   ├── chart.min.js
│   │   ├── d3.min.js
│   │   ├── echarts.min.js
│   │   └── gsap.min.js
│   └── images/                # Static images (not processed)
├── package.json               # NPM dependencies (Tailwind, etc.)
├── postcss.config.js          # PostCSS config for Tailwind
├── tailwind.config.js         # Tailwind configuration
└── README.md                  # Project documentation
```

---

## 4. Phase 1: Foundation Setup

### 4.1 Hugo Installation & Initialization

**Tasks**:
1. Verify Hugo is installed (`hugo version`)
2. Create new Hugo site: `hugo new site docs/teamleads_kz/hugo`
3. Initialize git repository in hugo folder
4. Create `.gitignore` for Hugo projects

**Deliverables**:
- Working Hugo site skeleton
- Git repository initialized

**Estimated Time**: 1 hour

---

### 4.2 TailwindCSS Integration

**Tasks**:
1. Initialize npm project: `npm init -y`
2. Install dependencies:
   ```bash
   npm install -D tailwindcss@latest postcss@latest autoprefixer@latest
   ```
3. Create `tailwind.config.js`:
   ```js
   module.exports = {
     content: [
       './layouts/**/*.html',
       './content/**/*.md'
     ],
     darkMode: 'class', // Already dark theme
     theme: {
       extend: {
         colors: {
           'deep-space': '#0F172A',
           'telegram-blue': '#2481CC',
           'starlight': '#F8FAFC',
           'ai-purple': {
             start: '#A855F7',
             end: '#D946EF'
           },
           'management-orange': {
             start: '#F97316',
             end: '#FDBA74'
           }
         },
         fontFamily: {
           'heading': ['Inter', 'system-ui', 'sans-serif'],
           'data': ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
           'body': ['Inter', 'system-ui', 'sans-serif']
         },
         backdropBlur: {
           glass: '12px'
         }
       }
     },
     plugins: []
   }
   ```
4. Create `postcss.config.js`
5. Create `assets/css/main.css` with Tailwind directives
6. Add build scripts to `package.json`

**Deliverables**:
- Tailwind configured and building
- Design system colors/fonts available as Tailwind classes

**Estimated Time**: 2 hours

---

### 4.3 JavaScript Libraries Setup

**Tasks**:
1. Download and place in `static/lib/`:
   - Chart.js (v4.x)
   - D3.js (v7.x)
   - Apache ECharts (v5.x)
   - GSAP with ScrollTrigger plugin
   - Alpine.js (v3.x)

2. Create NPM scripts for library management (optional CDN fallback)

3. Create `assets/js/main.js`:
   ```js
   // Alpine.js initialization
   import Alpine from 'alpinejs'
   window.Alpine = Alpine
   Alpine.start()

   // Import chart initializers
   import './charts/index.js'
   import './animations.js'
   ```

**Deliverables**:
- All JS libraries available
- Module bundling working (if using esbuild)

**Estimated Time**: 2 hours

---

### 4.4 Base Configuration

**Tasks**:
1. Configure `config/_default/config.toml`:
   ```toml
   baseURL = 'https://teamleads.kz/'  # Update for production
   languageCode = 'ru-RU'
   title = 'Тимлид не кодит - Итоги 2025'
   theme = ''  # No theme, custom layouts

   [params]
     description = '12 месяцев, 26 600 сообщений, одно сообщество'
     author = 'Тимлид не кодит Community'
     year = 2025

   [build]
     writeStats = true

   [minify]
     disableCSS = false
     disableHTML = false
     disableJS = false
   ```

2. Configure `menus.toml`:
   ```toml
   [[main]]
     name = "Обзор"
     url = "/overview"
     weight = 1

   [[main]]
     name = "Люди"
     url = "/people"
     weight = 2

   # ... etc for all pages
   ```

**Deliverables**:
- Hugo configured for Russian content
- Navigation menu defined

**Estimated Time**: 1 hour

---

## 5. Phase 2: Design System Implementation

### 5.1 Port Design Tokens

**Tasks**:
1. Create `assets/js/lib/designTokens.js` (port from React template):
   ```js
   export const colors = {
     deepSpace: '#0F172A',
     telegramBlue: '#2481CC',
     starlightText: '#F8FAFC',
     ai: {
       start: '#A855F7',
       end: '#D946EF'
     },
     management: {
       start: '#F97316',
       end: '#FDBA74'
     },
     positive: '#10B981',
     negative: '#EF4444',
     question: '#3B82F6',
     glass: {
       panel: 'rgba(30, 41, 59, 0.7)',
       border: 'rgba(255, 255, 255, 0.1)',
       grid: 'rgba(148, 163, 184, 0.05)'
     }
   }

   export const gradients = {
     ai: `linear-gradient(135deg, ${colors.ai.start} 0%, ${colors.ai.end} 100%)`,
     management: `linear-gradient(135deg, ${colors.management.start} 0%, ${colors.management.end} 100%)`,
     aurora: `linear-gradient(135deg, ${colors.ai.start} 0%, ${colors.management.start} 50%, ${colors.ai.end} 100%)`
   }

   export const fonts = {
     heading: '"Inter", system-ui, sans-serif',
     data: '"JetBrains Mono", "Fira Code", monospace',
     body: '"Inter", system-ui, sans-serif'
   }
   ```

2. Create corresponding CSS custom properties in `assets/css/main.css`:
   ```css
   :root {
     --color-deep-space: #0F172A;
     --color-telegram-blue: #2481CC;
     --color-starlight: #F8FAFC;

     --gradient-ai: linear-gradient(135deg, #A855F7 0%, #D946EF 100%);
     --gradient-management: linear-gradient(135deg, #F97316 0%, #FDBA74 100%);
     --gradient-aurora: linear-gradient(135deg, #A855F7 0%, #F97316 50%, #D946EF 100%);

     --font-heading: 'Inter', system-ui, sans-serif;
     --font-data: 'JetBrains Mono', 'Fira Code', monospace;

     --glass-blur: 12px;
     --border-radius-card: 24px;
   }
   ```

**Deliverables**:
- Design tokens available in JS and CSS
- Consistent color/font system

**Estimated Time**: 2 hours

---

### 5.2 Typography & Font Loading

**Tasks**:
1. Download fonts:
   - Inter (weights: 400, 600, 700, 800)
   - JetBrains Mono (weights: 400, 500, 700)

2. Place in `static/fonts/`

3. Create `@font-face` rules in `assets/css/fonts.css`

4. Add font preloading in `layouts/partials/head.html`:
   ```html
   <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>
   <link rel="preload" href="/fonts/jetbrains-mono.woff2" as="font" type="font/woff2" crossorigin>
   ```

**Deliverables**:
- Fonts loaded and accessible
- Typography matches design system

**Estimated Time**: 1.5 hours

---

### 5.3 Glassmorphism & Visual Effects

**Tasks**:
1. Create `assets/css/components/glass.css`:
   ```css
   .bento-card {
     @apply rounded-3xl;
     background: rgba(30, 41, 59, 0.7);
     backdrop-filter: blur(12px);
     border: 1px solid rgba(255, 255, 255, 0.1);
     transition: transform 0.3s ease, border-color 0.3s ease;
   }

   .bento-card:hover {
     transform: scale(1.01);
     border-color: rgba(255, 255, 255, 0.2);
   }

   .glass-panel {
     background: rgba(30, 41, 59, 0.7);
     backdrop-filter: blur(var(--glass-blur));
     border: 1px solid var(--color-glass-border);
   }
   ```

2. Create grid background pattern utility
3. Create aurora gradient animations

**Deliverables**:
- Glassmorphism CSS classes ready
- Background effects implemented

**Estimated Time**: 2 hours

---

## 6. Phase 3: Layout & Components

### 6.1 Base Layout Template

**File**: `layouts/_default/baseof.html`

**Tasks**:
1. Create HTML structure:
   ```html
   <!DOCTYPE html>
   <html lang="{{ .Site.LanguageCode }}" class="dark">
   <head>
     {{ partial "head.html" . }}
   </head>
   <body class="min-h-screen text-starlight bg-deep-space relative overflow-x-hidden">
     <!-- Grid background -->
     <div class="fixed inset-0 opacity-5 pointer-events-none grid-pattern"></div>

     {{ partial "floating-dock.html" . }}

     <main>
       {{ block "main" . }}{{ end }}
     </main>

     {{ partial "footer.html" . }}

     {{ partial "scripts.html" . }}
   </body>
   </html>
   ```

2. Implement grid background pattern
3. Add body-level Alpine.js initialization

**Deliverables**:
- Base template with proper structure
- Grid pattern working

**Estimated Time**: 2 hours

---

### 6.2 Core Partials

#### 6.2.1 Head Partial

**File**: `layouts/partials/head.html`

**Content**:
```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{ .Title }} | {{ .Site.Title }}</title>
<meta name="description" content="{{ .Description | default .Site.Params.description }}">

<!-- Fonts preload -->
<link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/jetbrains-mono.woff2" as="font" type="font/woff2" crossorigin>

<!-- Styles -->
{{ $css := resources.Get "css/main.css" | postCSS | minify | fingerprint }}
<link rel="stylesheet" href="{{ $css.RelPermalink }}">

<!-- SEO -->
<meta property="og:title" content="{{ .Title }}">
<meta property="og:description" content="{{ .Description }}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```

**Estimated Time**: 1.5 hours

---

#### 6.2.2 Floating Dock

**File**: `layouts/partials/floating-dock.html`

**Port from**: `template/src/components/FloatingDock.tsx`

**Implementation**:
```html
<nav
  class="fixed bottom-8 left-1/2 -translate-x-1/2 z-50"
  x-data="{ activeDock: '' }"
>
  <div class="glass-panel rounded-full px-6 py-3 flex gap-4">
    {{ $pages := slice "hero" "metrics" "big-four" "sentiment" "network" }}
    {{ range $pages }}
    <a
      href="#{{ . }}"
      class="dock-icon transition-transform hover:scale-125"
      @mouseenter="activeDock = '{{ . }}'"
      @mouseleave="activeDock = ''"
    >
      <!-- Icon SVG here -->
    </a>
    {{ end }}
  </div>
</nav>
```

**Estimated Time**: 2 hours

---

#### 6.2.3 Footer

**File**: `layouts/partials/footer.html`

**Port from**: `template/src/components/Footer.tsx`

**Implementation**: Standard footer with copyright, links, social icons

**Estimated Time**: 1.5 hours

---

### 6.3 Component Partials

#### 6.3.1 Bento Card

**File**: `layouts/partials/components/bento-card.html`

**Port from**: `template/src/components/BentoCard.tsx`

**Usage**:
```html
{{ partial "components/bento-card.html" (dict
  "title" "Messages"
  "value" "26,600"
  "icon" "💬"
  "link" "/overview"
) }}
```

**Estimated Time**: 1 hour

---

#### 6.3.2 Stat Display

**File**: `layouts/partials/components/stat-display.html`

**Implementation**: Reusable metric display with count-up animation

**Estimated Time**: 1 hour

---

#### 6.3.3 Hero Section

**File**: `layouts/partials/components/hero.html`

**Port from**: `template/src/components/Hero.tsx`

**Features**:
- Animated particle background (Canvas or CSS)
- Aurora gradient animation
- Scroll indicator
- Fade-in text animation

**Estimated Time**: 3 hours

---

### 6.4 Infographic Partials

Each infographic gets its own partial. Examples:

#### 6.4.1 Timeline

**File**: `layouts/partials/infographics/timeline.html`

**Implementation**:
```html
<div id="timeline-chart" class="w-full h-96"></div>
<script>
  // D3.js timeline initialization
  // Data from Hugo data files
</script>
```

**Estimated Time**: 3 hours (for complex D3 implementation)

---

#### 6.4.2 Heatmap

**File**: `layouts/partials/infographics/heatmap.html`

**Library**: Apache ECharts calendar heatmap

**Estimated Time**: 3 hours

---

#### 6.4.3 Word Cloud

**File**: `layouts/partials/infographics/wordcloud.html`

**Library**: D3-cloud

**Estimated Time**: 2.5 hours

---

#### 6.4.4 Network Graph

**File**: `layouts/partials/infographics/network-graph.html`

**Library**: D3-force layout

**Complexity**: Highest

**Estimated Time**: 4 hours

---

## 7. Phase 4: Page Development

### 7.1 Homepage

**File**: `content/_index.md`

**Frontmatter**:
```yaml
---
title: "Тимлид не кодит - Итоги 2025"
description: "12 месяцев, 26 600 сообщений, одно сообщество"
layout: index
---
```

**Template**: `layouts/index.html`

**Sections** (from homepage.md):
1. Hero section
2. Timeline infographic
3. Key metrics dashboard (4 cards)
4. Activity heatmap
5. Topic word cloud
6. Big Four network preview
7. Sentiment overview donut
8. Navigation cards to other sections

**Estimated Time**: 8 hours

---

### 7.2 Overview Page

**File**: `content/overview.md`

**Infographics** (8 total):
1. Total growth curve
2. Monthly message distribution
3. Growth rate line chart (dual-axis)
4. Activity clock (24-hour heatmap)
5. Day of week distribution
6. Seasonal trends
7. Engagement metrics dashboard
8. Activity intensity heatmap

**Estimated Time**: 10 hours

---

### 7.3 People Page

**File**: `content/people.md`

**Infographics** (9 total):
1. Big Four spotlight (4 cards)
2. Top 20 contributors bar chart
3. Contribution distribution donut
4. Founding members timeline
5. Rising stars leaderboard
6. Activity patterns by top contributors
7. Messages per day heatmap
8. Average message length bubble chart
9. Contributor network roles treemap

**Estimated Time**: 12 hours

---

### 7.4 Topics Page

**File**: `content/topics.md`

**Infographics** (12 total - most complex):
1. Topic distribution treemap
2. Topic evolution timeline (streamgraph)
3. AI/ML dominance gauge
4. Monthly topic heatmap
5. Top keywords word cloud
6. Topic co-occurrence network
7. AI/ML sub-topics sunburst
8. Seasonal topic trends (radial)
9. Management sub-topics bar
10. Career trajectory sankey
11. Topic sentiment correlation scatter
12. Topic discussion depth dashboard

**Estimated Time**: 16 hours

---

### 7.5 Sentiment Page

**File**: `content/sentiment.md`

**Infographics** (10 total):
1. Overall sentiment distribution (large donut)
2. Sentiment timeline (monthly trends)
3. Sentiment by topic (grouped bar)
4. Keyword vs ML comparison (side-by-side donuts)
5. ML confidence analysis (box plot)
6. Sentiment heatmap (month × day)
7. Question deep dive dashboard
8. Positive vs negative correlation scatter
9. Validation results (confidence intervals)
10. Sentiment journey (sankey flow)

**Estimated Time**: 14 hours

---

### 7.6 Network Page

**File**: `content/network.md`

**Infographics** (11 total - most complex visualizations):
1. Full network graph (interactive force-directed)
2. Big Four ego networks (4 panels)
3. Network centrality metrics dashboard
4. Community clusters treemap
5. Reply network heatmap (adjacency matrix)
6. Temporal proximity analysis timeline
7. Interaction sentiment breakdown
8. Network density over time
9. Reciprocity analysis donut
10. Hub connectors spotlight (radial)
11. Cluster interconnection chord diagram

**Estimated Time**: 18 hours

---

### 7.7 Insights Page

**File**: `content/insights.md`

**Infographics** (8 total):
1. Year highlights dashboard (6 metrics)
2. Top 10 insights (ranked list)
3. AI dominance trend & forecast
4. Community health score (radial gauge)
5. What's working vs what's not (comparison)
6. 2026 predictions timeline
7. Recommendations grid (3×3)
8. Year in numbers (animated wall)

**Estimated Time**: 10 hours

---

## 8. Phase 5: Data Integration

### 8.1 Data File Preparation

**Tasks**:
1. Process CSV files to JSON:
   - `messages_export.csv` → `data/messages.json`
   - `sentiment_by_month_corrected.csv` → `data/sentiment_keyword.json`
   - `sentiment_by_month_rubert.csv` → `data/sentiment_ml.json`
   - Network analysis → `data/network.json`
   - Topic analysis → `data/topics.json`

2. Create aggregation scripts (Python/Node.js):
   ```python
   # Example: aggregate_messages.py
   import pandas as pd
   import json

   df = pd.read_csv('messages_export.csv')

   # Monthly aggregation
   monthly = df.groupby(df['date'].dt.to_period('M')).size()

   # Export to JSON
   with open('data/messages.json', 'w') as f:
       json.dump(monthly.to_dict(), f)
   ```

3. Pre-compute expensive metrics:
   - Network centrality scores
   - Topic frequencies
   - Sentiment distributions
   - User rankings

**Deliverables**:
- All data files in `data/` directory as JSON
- Data processing scripts documented
- Data schema documented

**Estimated Time**: 6 hours

---

### 8.2 Hugo Data Templates

**Tasks**:
1. Access data in templates:
   ```html
   {{ $messages := .Site.Data.messages }}
   {{ $sentiment := .Site.Data.sentiment }}

   <div id="chart-container"
        data-messages='{{ $messages | jsonify }}'>
   </div>
   ```

2. Create data partials for common queries:
   ```html
   <!-- layouts/partials/data/top-contributors.html -->
   {{ $network := .Site.Data.network }}
   {{ range first 4 $network.contributors }}
     <div>{{ .name }}: {{ .messages }}</div>
   {{ end }}
   ```

**Deliverables**:
- Data accessible in all templates
- Helper partials for common data queries

**Estimated Time**: 4 hours

---

## 9. Phase 6: Animations & Interactivity

### 9.1 GSAP Scroll Animations

**File**: `assets/js/animations.js`

**Tasks**:
1. Implement ScrollTrigger for:
   - Fade-in on viewport entry
   - Slide-in from bottom/sides
   - Chart drawing animations
   - Parallax background effects

2. Example implementation:
   ```js
   import { gsap } from 'gsap';
   import { ScrollTrigger } from 'gsap/ScrollTrigger';

   gsap.registerPlugin(ScrollTrigger);

   // Fade in sections
   gsap.utils.toArray('.animate-on-scroll').forEach(elem => {
     gsap.from(elem, {
       opacity: 0,
       y: 50,
       duration: 1,
       scrollTrigger: {
         trigger: elem,
         start: 'top 80%',
         end: 'top 50%',
         scrub: 1
       }
     });
   });

   // Count-up animations
   gsap.utils.toArray('.count-up').forEach(elem => {
     const target = parseInt(elem.dataset.target);
     gsap.to(elem, {
       innerText: target,
       duration: 2,
       snap: { innerText: 1 },
       scrollTrigger: {
         trigger: elem,
         start: 'top 80%'
       }
     });
   });
   ```

**Deliverables**:
- Scroll-triggered animations working
- Performance optimized (no jank)

**Estimated Time**: 8 hours

---

### 9.2 Chart Animations

**Tasks**:
1. **Chart.js**: Enable built-in animations
   ```js
   {
     animation: {
       onComplete: function() {
         // Animation finished
       },
       delay: (context) => {
         return context.dataIndex * 50; // Stagger
       }
     }
   }
   ```

2. **D3.js**: Custom transitions
   ```js
   svg.selectAll('circle')
     .transition()
     .duration(1000)
     .attr('r', d => d.value)
   ```

3. **ECharts**: Configure animation options

**Deliverables**:
- All charts animate on first view
- Draw-on-scroll for line/area charts

**Estimated Time**: 6 hours

---

### 9.3 Alpine.js Interactivity

**Tasks**:
1. Implement interactive states:
   ```html
   <div x-data="{ activeFilter: 'all' }">
     <button @click="activeFilter = 'positive'">Positive</button>
     <div x-show="activeFilter === 'positive'">...</div>
   </div>
   ```

2. Chart filtering:
   ```html
   <div x-data="chartFilter()">
     <select x-model="selectedMonth" @change="updateChart()">
       <option value="all">All Months</option>
       <!-- ... -->
     </select>
     <div id="chart"></div>
   </div>
   ```

3. Tooltip positioning
4. Modal/panel toggles

**Deliverables**:
- Interactive filtering working
- Tooltips functional
- Modals/panels working

**Estimated Time**: 8 hours

---

### 9.4 Hover & Click Effects

**Tasks**:
1. Magnetic buttons (cursor follow)
2. Card hover effects (lift, glow)
3. Chart element highlighting
4. Cross-chart interactions (click bar → filter other charts)

**Deliverables**:
- Polished micro-interactions
- Consistent hover states

**Estimated Time**: 4 hours

---

## 10. Phase 7: Optimization & Polish

### 10.1 Performance Optimization

**Tasks**:
1. **Image Optimization**:
   - Use Hugo image processing
   - WebP format with fallbacks
   - Lazy loading

2. **JS Bundling**:
   - Minify all JS
   - Code splitting (load chart libs only on pages that need them)
   - Defer non-critical JS

3. **CSS Optimization**:
   - PurgeCSS via Tailwind
   - Critical CSS inlining
   - Remove unused styles

4. **Asset Loading**:
   - CDN for libraries (with local fallback)
   - Resource hints (preload, prefetch, preconnect)
   - Font subsetting

**Deliverables**:
- Lighthouse Performance score > 90
- First Contentful Paint < 1.5s
- Total bundle size < 500KB (gzipped)

**Estimated Time**: 8 hours

---

### 10.2 Responsive Design Testing

**Tasks**:
1. Test all pages on:
   - Mobile: 375px (iPhone SE), 414px (iPhone Pro Max)
   - Tablet: 768px (iPad), 1024px (iPad Pro)
   - Desktop: 1280px, 1920px, 2560px

2. Fix layout issues:
   - Horizontal scroll prevention
   - Touch-friendly tap targets (min 44px)
   - Chart responsiveness
   - Text readability

3. Progressive disclosure for mobile:
   - Accordion sections
   - Swipeable charts
   - Bottom sheet menus

**Deliverables**:
- All breakpoints tested and working
- No layout bugs
- Touch interactions smooth

**Estimated Time**: 10 hours

---

### 10.3 Accessibility (WCAG 2.1 AA)

**Tasks**:
1. **Semantic HTML**:
   - Proper heading hierarchy
   - ARIA labels for interactive elements
   - Alt text for images

2. **Keyboard Navigation**:
   - Tab order logical
   - Focus indicators visible
   - Skip links for navigation

3. **Color Contrast**:
   - Text meets 4.5:1 ratio
   - Chart colors distinguishable
   - Focus states visible

4. **Screen Reader Testing**:
   - Test with VoiceOver/NVDA
   - Chart data tables as fallback
   - Proper announcements

**Deliverables**:
- Lighthouse Accessibility score: 100
- Axe DevTools: 0 violations
- Manual screen reader test passed

**Estimated Time**: 8 hours

---

### 10.4 SEO Optimization

**Tasks**:
1. **Meta Tags**:
   - Unique title/description per page
   - Open Graph tags
   - Twitter Card tags
   - Canonical URLs

2. **Structured Data**:
   - JSON-LD for Organization
   - Breadcrumbs
   - Article schema (if applicable)

3. **Sitemap & Robots**:
   - Generate sitemap.xml
   - Configure robots.txt
   - Submit to search engines

4. **Performance**:
   - Already covered in 10.1

**Deliverables**:
- Lighthouse SEO score > 95
- Rich snippets preview working
- Sitemap generated

**Estimated Time**: 4 hours

---

### 10.5 Cross-Browser Testing

**Tasks**:
1. Test on:
   - Chrome (latest)
   - Firefox (latest)
   - Safari (latest)
   - Edge (latest)
   - Mobile browsers (Safari iOS, Chrome Android)

2. Fix browser-specific issues:
   - Backdrop-filter fallbacks
   - CSS Grid/Flexbox inconsistencies
   - SVG rendering differences

**Deliverables**:
- Works correctly on all major browsers
- Graceful degradation for older browsers

**Estimated Time**: 6 hours

---

## 11. Deployment Strategy

### 11.1 Hosting Options

**Recommended**: **Netlify** or **Cloudflare Pages**

**Rationale**:
- Free tier sufficient for static site
- Automatic HTTPS
- Global CDN
- Git-based deployment
- Hugo support built-in

**Alternative**: GitHub Pages, Vercel, AWS S3 + CloudFront

---

### 11.2 Build Configuration

**Netlify** (`netlify.toml`):
```toml
[build]
  publish = "public"
  command = "hugo --gc --minify"

[build.environment]
  HUGO_VERSION = "0.122.0"
  NODE_VERSION = "18"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"

[[headers]]
  for = "/fonts/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/lib/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

---

### 11.3 Continuous Deployment

**Workflow**:
1. Push to `main` branch → triggers build
2. Netlify runs `hugo --gc --minify`
3. Deploys to production URL
4. Branch previews for pull requests

**Estimated Time for Setup**: 2 hours

---

## 12. Testing & Quality Assurance

### 12.1 Testing Checklist

**Functional Testing**:
- [ ] All 8 pages load without errors
- [ ] All 64 infographics render correctly
- [ ] Navigation works (dock, menu, links)
- [ ] Animations trigger on scroll
- [ ] Interactive filters work
- [ ] Tooltips display properly
- [ ] Links go to correct destinations

**Visual Testing**:
- [ ] Design matches design system
- [ ] Glassmorphism effects render
- [ ] Gradients display correctly
- [ ] Fonts load properly
- [ ] Colors match specifications
- [ ] Spacing consistent

**Performance Testing**:
- [ ] Lighthouse Performance > 90
- [ ] FCP < 1.5s
- [ ] LCP < 2.5s
- [ ] CLS < 0.1
- [ ] TTI < 3.5s

**Accessibility Testing**:
- [ ] Lighthouse Accessibility = 100
- [ ] Keyboard navigation works
- [ ] Screen reader announces correctly
- [ ] Color contrast passes
- [ ] ARIA labels present

**SEO Testing**:
- [ ] Meta tags unique per page
- [ ] OG tags present
- [ ] Sitemap generated
- [ ] Robots.txt configured
- [ ] Structured data valid

**Browser Testing**:
- [ ] Chrome: ✓
- [ ] Firefox: ✓
- [ ] Safari: ✓
- [ ] Edge: ✓
- [ ] Mobile Safari: ✓
- [ ] Mobile Chrome: ✓

**Responsive Testing**:
- [ ] Mobile (375px): ✓
- [ ] Mobile Large (414px): ✓
- [ ] Tablet (768px): ✓
- [ ] Desktop (1280px): ✓
- [ ] Desktop Large (1920px): ✓

---

### 12.2 User Acceptance Testing

**Tasks**:
1. Internal review by stakeholders
2. Gather feedback on:
   - Content accuracy
   - Visual appeal
   - Usability
   - Performance
3. Iterate based on feedback

**Estimated Time**: 4 hours (spread over 1 week)

---

## 13. Timeline & Milestones

### 13.1 Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| **Phase 1: Foundation Setup** | 6 hours | 6h |
| **Phase 2: Design System** | 5.5 hours | 11.5h |
| **Phase 3: Layout & Components** | 20.5 hours | 32h |
| **Phase 4: Page Development** | 88 hours | 120h |
| **Phase 5: Data Integration** | 10 hours | 130h |
| **Phase 6: Animations & Interactivity** | 26 hours | 156h |
| **Phase 7: Optimization & Polish** | 36 hours | 192h |
| **Testing & QA** | 12 hours | 204h |
| **Deployment** | 2 hours | 206h |

**Total Estimated Effort**: **206 hours** (~26 working days for 1 developer)

**With buffer (20%)**: **247 hours** (~31 working days)

---

### 13.2 Milestones

**Week 1**: Foundation & Design System
- [ ] Hugo project initialized
- [ ] TailwindCSS configured
- [ ] Design tokens implemented
- [ ] Base layout ready

**Week 2**: Core Components & Homepage
- [ ] All component partials created
- [ ] Homepage complete with 6 infographics
- [ ] Floating dock working
- [ ] Basic animations

**Week 3**: Overview & People Pages
- [ ] Overview page complete (8 infographics)
- [ ] People page complete (9 infographics)
- [ ] Data integration working

**Week 4**: Topics & Sentiment Pages
- [ ] Topics page complete (12 infographics)
- [ ] Sentiment page complete (10 infographics)
- [ ] Advanced charts (streamgraph, sankey) working

**Week 5**: Network & Insights Pages
- [ ] Network page complete (11 infographics)
- [ ] Insights page complete (8 infographics)
- [ ] All 64 infographics functional

**Week 6**: Optimization & Testing
- [ ] Performance optimization complete
- [ ] Accessibility fixes applied
- [ ] Cross-browser testing complete
- [ ] SEO optimized

**Week 7**: Polish & Deployment
- [ ] Final QA passed
- [ ] Deployed to production
- [ ] Monitoring set up
- [ ] Documentation complete

---

## 14. Risk Assessment

### 14.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Complex D3.js visualizations** | High | High | Start with simpler Chart.js, add D3 progressively. Use examples from Observable. |
| **Performance issues with 64 charts** | Medium | High | Lazy load charts, use IntersectionObserver, code splitting. |
| **Glassmorphism not supported on older browsers** | Medium | Low | Provide fallback solid backgrounds. Feature detection. |
| **Data processing bottlenecks** | Low | Medium | Pre-process data during build, not runtime. Cache aggressively. |
| **Animation performance on mobile** | Medium | Medium | Reduce animations on mobile, use `prefers-reduced-motion`. |
| **Hugo build time with large datasets** | Low | Low | Optimize data files, use Hugo caching. |

---

### 14.2 Content Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Data accuracy issues** | Medium | High | Validate all data against source CSVs. Double-check calculations. |
| **Missing infographic specifications** | Low | Medium | Reference React template, contact designer if unclear. |
| **Content not matching Russian audience** | Low | Medium | Have native Russian speaker review copy. |

---

### 14.3 Timeline Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Underestimated complexity of network graphs** | High | High | Allocate extra time buffer. Use existing D3 examples. |
| **Scope creep (adding features)** | Medium | Medium | Strict adherence to design specs. "Nice to have" → Phase 2. |
| **Integration issues** | Medium | Medium | Test integrations early (TailwindCSS, Alpine, GSAP). |

---

## Appendix A: Component Mapping Reference

| React Component | Hugo Partial | Complexity | Estimated Time |
|-----------------|--------------|------------|----------------|
| `Hero.tsx` | `partials/components/hero.html` | Medium | 3h |
| `KeyMetrics.tsx` | `partials/components/key-metrics.html` | Low | 2h |
| `BigFour.tsx` | `partials/components/big-four.html` | Medium | 3h |
| `ActivityTimeline.tsx` | `partials/infographics/timeline.html` | High | 4h |
| `TopTopics.tsx` | `partials/infographics/wordcloud.html` | Medium | 2.5h |
| `SentimentRing.tsx` | `partials/infographics/sentiment-donut.html` | Medium | 2h |
| `NetworkViz.tsx` | `partials/infographics/network-graph.html` | Very High | 5h |
| `FloatingDock.tsx` | `partials/floating-dock.html` | Medium | 2h |
| `Footer.tsx` | `partials/footer.html` | Low | 1.5h |
| `BentoCard.tsx` | `partials/components/bento-card.html` | Low | 1h |
| `StatDisplay.tsx` | `partials/components/stat-display.html` | Low | 1h |

---

## Appendix B: Library Decision Matrix

| Feature | Chart.js | D3.js | ECharts | Winner | Reason |
|---------|----------|-------|---------|--------|--------|
| Bar/Line/Donut | ✅ Excellent | ✅ Good | ✅ Excellent | Chart.js | Simpler API, smaller bundle |
| Network Graph | ❌ No | ✅ Excellent | ❌ No | D3.js | Only option |
| Heatmap | ❌ Limited | ✅ Good | ✅ Excellent | ECharts | Built-in calendar heatmap |
| Streamgraph | ❌ No | ✅ Excellent | ✅ Good | D3.js | More examples available |
| Sankey Diagram | ❌ No | ✅ Good | ✅ Excellent | ECharts | Easier configuration |
| Treemap | ❌ No | ✅ Good | ✅ Excellent | ECharts | Better defaults |
| Sunburst | ❌ No | ✅ Excellent | ✅ Good | D3.js | More customizable |
| Word Cloud | ❌ No | ✅ Excellent (d3-cloud) | ❌ Plugin | D3.js | d3-cloud is standard |

**Strategy**: Use Chart.js for simple charts, ECharts for heatmaps/treemaps/sankey, D3.js for network/sunburst/wordcloud.

---

## Appendix C: Data Schema Examples

### messages.json
```json
{
  "total": 26600,
  "byMonth": {
    "2025-01": 344,
    "2025-02": 641,
    ...
  },
  "byDay": {
    "monday": 5855,
    "tuesday": 5015,
    ...
  },
  "byHour": {
    "0": 123,
    "1": 89,
    ...
  }
}
```

### network.json
```json
{
  "bigFour": [
    {
      "name": "Andrii Kurdiumov",
      "messages": 6266,
      "rank": 1
    },
    ...
  ],
  "nodes": [
    { "id": "user1", "messages": 100, "centrality": 0.8 },
    ...
  ],
  "edges": [
    { "source": "user1", "target": "user2", "weight": 50 },
    ...
  ]
}
```

---

## Appendix D: Command Reference

### Development Commands
```bash
# Start Hugo dev server
hugo server -D

# Build for production
hugo --gc --minify

# TailwindCSS watch
npx tailwindcss -i ./assets/css/main.css -o ./static/css/output.css --watch

# Run both concurrently
npm run dev  # (requires concurrent package)
```

### Deployment Commands
```bash
# Deploy to Netlify (CLI)
netlify deploy --prod

# Build only
hugo --gc --minify --environment production
```

---

## Conclusion

This implementation plan provides a comprehensive roadmap for converting the React/Vite template into a Hugo-based static website. The phased approach ensures:

1. **Solid foundation** with proper tooling setup
2. **Design system consistency** by porting tokens and components
3. **Incremental development** with testable milestones
4. **Quality assurance** through optimization and testing phases
5. **Manageable timeline** with clear deliverables

The estimated **206 hours** (with 20% buffer: **247 hours**) represents approximately **6-7 weeks** of focused development for a single developer familiar with Hugo, JavaScript, and data visualization libraries.

**Success Criteria**:
- ✅ All 8 pages published with 64 infographics
- ✅ Lighthouse scores: Performance > 90, Accessibility = 100, SEO > 95
- ✅ Responsive design working on all breakpoints
- ✅ Animations smooth and performant
- ✅ Data accurate and validated
- ✅ Deployed to production with CDN

**Next Steps**:
1. Review and approve this plan
2. Set up development environment
3. Begin Phase 1: Foundation Setup
4. Weekly progress reviews against milestones
5. Iterate based on feedback

---

**Document Version**: 1.0
**Last Updated**: December 27, 2025
**Author**: Claude Sonnet 4.5
**Contact**: [Project Lead Email]
