# Profile System Documentation

This Hugo site uses a centralized profile system for displaying community member information consistently across all pages.

## Architecture

### 1. Data Source (`/data/profiles.json`)

All profile information is stored in a single JSON file with three main categories:
- `big_four` - Level 0 core members
- `level_1` - Inner circle (10 people)
- `level_2` - Extended network

Each profile contains:
```json
{
  "id": "unique_identifier",
  "name": "Full Name",
  "short_name": "Short N.",
  "username": "telegram_username",  // nullable
  "avatar": "/images/avatars/filename.jpg",
  "level": 0,  // 0, 1, or 2
  "role": "Role Title",
  "description": "Brief description",
  "stats": {
    "messages": 6266,  // for Level 0
    "connections": 411,
    "outgoing": 2047,  // for Level 0
    "incoming": 1996,  // for Level 0
    "unique_connections": 124,  // for Level 0
    "top_connections": ["Person (count)", ...]  // for Level 1
  },
  "color": "tailwind-color-class",
  "medal": "🥇"  // for Big Four only
}
```

### 2. Profile Card Component (`/layouts/partials/components/profile-card.html`)

Reusable component for displaying profiles in different variants:

**Variants:**
- `big-four` - Large cards with medals, avatars, and stats
- `level-1` - Medium cards with avatars and connection info
- `level-2` - Compact cards for extended network
- `compact` - Minimal inline display

**Usage:**
```go
{{ partial "components/profile-card.html" (dict "profile" $profile "variant" "big-four") }}
```

### 3. Avatar System (`/static/images/avatars/`)

Profile images with automatic fallback to initials if image is missing.

## How to Use

### Display Big Four on Homepage

```go
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  {{- range .Site.Data.profiles.big_four -}}
  {{ partial "components/profile-card.html" (dict "profile" . "variant" "big-four") }}
  {{- end -}}
</div>
```

### Display Level 1 Members

```go
<div class="grid md:grid-cols-3 gap-4">
  {{- range .Site.Data.profiles.level_1 -}}
  {{ partial "components/profile-card.html" (dict "profile" . "variant" "level-1") }}
  {{- end -}}
</div>
```

### Display First 6 Level 1 Members

```go
{{- range first 6 .Site.Data.profiles.level_1 -}}
{{ partial "components/profile-card.html" (dict "profile" . "variant" "level-1") }}
{{- end -}}
```

### Get Specific Profile by ID

```go
{{- $profile := index .Site.Data.profiles.big_four 0 -}}
{{ partial "components/profile-card.html" (dict "profile" $profile "variant" "compact") }}
```

### Display Compact Inline

```go
{{- range .Site.Data.profiles.level_2 -}}
{{ partial "components/profile-card.html" (dict "profile" . "variant" "compact") }}
{{- end -}}
```

## Adding New Profiles

1. **Add to `/data/profiles.json`:**
   ```json
   {
     "id": "new_person",
     "name": "New Person",
     "short_name": "New P.",
     "username": "newperson",
     "avatar": "/images/avatars/newperson.jpg",
     "level": 1,
     "role": "Participant",
     "description": "Description here",
     "stats": {
       "connections": 50
     }
   }
   ```

2. **Add avatar image:**
   - Place image in `/static/images/avatars/newperson.jpg`
   - Recommended: 200x200px square, under 100KB

3. **The profile will automatically appear** in any page that loops through the appropriate level.

## Updating Profile Information

Simply edit `/data/profiles.json` - changes will reflect across all pages automatically on next build.

## Current Usage

- **Homepage (`/layouts/index.html`)**: Big Four section
- **Network Page (`/layouts/_default/network.html`)**: Level 0, 1, 2 cards
- **SVG Network Visualization**: Uses profile data for node names

## Benefits

✅ Single source of truth for all profile data
✅ Consistent display across all pages
✅ Easy to add/update profiles
✅ Avatar support with automatic fallbacks
✅ Reusable component reduces code duplication
✅ Centralized stats and connection data
