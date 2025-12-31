# Тимлид не кодит - Итоги 2025

Hugo static website showcasing the year in review for the Teamleads.kz community.

## 🚀 Quick Start

### Development Server

```bash
npm run dev
```

Visit `http://localhost:1313` to see the site.

### Build for Production

```bash
npm run build
```

The built site will be in the `public/` directory.

## ✨ Features Implemented

### Phase 1: Foundation ✅
- Hugo site structure
- TailwindCSS v3 integration with PostCSS
- Russian language configuration
- Design system with glassmorphism effects

### Phase 2: Design System ✅
- Custom color palette (Deep Space, Telegram Blue, AI Purple, Management Orange)
- Typography system (Inter for headings/body, JetBrains Mono for data)
- Bento Card components with glassmorphism
- Aurora gradient backgrounds
- Grid pattern overlay

### Phase 3: Base Layout ✅
- `baseof.html` with animated backgrounds
- Grid pattern background
- Aurora gradient animation
- Footer with navigation links
- Responsive container system

### Phase 4: Homepage Components ✅
- **Hero Section** with:
  - Animated particle background (50 particles with pulse glow)
  - Gradient text animations
  - Slide-up entrance animations (staggered delays)
  - Scroll indicator with pulse animation
  - Russian text formatting

- **Key Metrics Section** with:
  - 4 Bento Cards (Messages, Contributors, Top Topic, Sentiment)
  - Count-up animations triggered on scroll (IntersectionObserver)
  - Russian number formatting (26 600 instead of 26,600)
  - Hover effects with scale transformation

- **Big Four Preview Section** with:
  - 4 profile cards with medal emojis (🥇🥈🥉⭐)
  - Gradient avatar circles
  - Count-up animations
  - Hover border glow effects
  - Link to detailed People page

### Phase 5: Navigation ✅
- **Floating Dock** (macOS-style):
  - Glass panel with backdrop blur
  - 5 navigation icons (Home, Metrics, Big Four, Topics, Network)
  - Hover scale animation (1.25x)
  - Alpine.js tooltip on hover
  - Smooth scroll to sections
  - Hidden on mobile, visible on desktop (md breakpoint)

### Phase 6: Animations & Polish ✅
- Smooth scroll behavior (`scroll-behavior: smooth`)
- Count-up animations with Russian number formatting
- Slide-up entrance animations with staggered delays
- Pulse glow animations for particles and scroll indicator
- Aurora gradient animation (20s infinite loop)
- Bento card hover effects (scale, border glow)
- IntersectionObserver for scroll-triggered animations

## 🎨 Design System

### Colors

```css
--color-deep-space: #0F172A        /* Main background */
--color-telegram-blue: #2481CC      /* Brand color */
--color-starlight: #F8FAFC          /* Text color */
```

### Gradients

- **AI Gradient**: Purple (#A855F7) → Fuchsia (#D946EF)
- **Management Gradient**: Orange (#F97316) → Amber (#FDBA74)
- **Aurora Gradient**: Purple → Orange → Fuchsia (animated)

### Typography

- **Headings**: Inter 700/800, tight tracking
- **Data/Numbers**: JetBrains Mono 500/700
- **Body**: Inter 400

### Components

- **Bento Card**: Glassmorphism card with rounded corners (24px), backdrop blur, subtle border
- **Glass Panel**: Semi-transparent panel with backdrop blur for navigation
- **Grid Pattern**: Subtle background grid (50px × 50px)

## 📁 Project Structure

```
hugo-claude/
├── assets/
│   └── css/
│       └── main.css              # TailwindCSS + custom styles
├── content/
│   └── _index.md                 # Homepage frontmatter
├── layouts/
│   ├── _default/
│   │   └── baseof.html           # Base template
│   ├── partials/
│   │   ├── head.html             # <head> section
│   │   ├── footer.html           # Site footer
│   │   ├── floating-dock.html    # Navigation dock
│   │   └── components/
│   │       └── hero.html         # Hero section
│   └── index.html                # Homepage template
├── hugo.toml                     # Hugo configuration
├── tailwind.config.js            # Tailwind configuration
├── postcss.config.js             # PostCSS configuration
└── package.json                  # NPM dependencies
```

## 🔧 Technologies

- **Hugo** v0.140.0 - Static site generator
- **TailwindCSS** v3.4 - Utility-first CSS framework
- **Alpine.js** v3 - Lightweight JavaScript framework for interactivity
- **PostCSS** - CSS processing
- **Google Fonts** - Inter & JetBrains Mono

## 📊 Data Sources

All data is sourced from `/docs/teamleads_kz/year-in-review-2025.md`:

- Total messages: **26 600**
- Active contributors: **139**
- Top topic: **AI & ML**
- Sentiment: **69.6%** neutral
- Big Four contributors with message counts

## 🎯 Russian Localization

- All text in Russian language
- Russian number formatting (space separator: `26 600`)
- Cyrillic character support
- `lang="ru-RU"` in HTML

## 🌐 Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- CSS Grid & Flexbox
- Backdrop blur filter (with fallback)
- IntersectionObserver API for scroll animations

## 📝 Next Steps

To add more pages:

1. Create content file: `content/people.md`
2. Create layout: `layouts/people.html` or use `_default/single.html`
3. Add data visualizations as partials
4. Update navigation links

## 🎨 Animation Timeline

- **0s**: Year badge fade-in
- **0.2s**: Main title fade-in
- **0.4s**: Subtitle fade-in
- **0.6s**: Scroll indicator fade-in
- **On scroll**: Count-up animations trigger at 50% viewport entry
- **Continuous**: Aurora gradient (20s cycle), particle pulse (2-5s random)

## 🏗️ Build Details

- **Build time**: ~371ms
- **Pages generated**: 5
- **Minified**: HTML, CSS, JS
- **No static assets** (using CDNs for fonts and Alpine.js)

## 📄 License

Year in Review 2025 - Тимлид не кодит Community

---

**Server running at**: http://localhost:1313 (development)
**Last updated**: December 27, 2025
