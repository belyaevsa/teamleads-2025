# Avatar Images

This directory contains avatar images for community members.

## File Naming Convention

Avatar files should match the filenames specified in `/data/profiles.json`:

### Big Four (Level 0)
- `andrii.jpg` - Andrii Kurdiumov
- `artur.jpg` - Артур Пан
- `teymur.jpg` - Теймур Шайкемелов
- `stanislav.jpg` - Stanislav Belyaev

### Level 1 (Inner Circle)
- `vassiliy.jpg` - Vassiliy
- `dmitriy.jpg` - Dmitriy Melnik
- `azat.jpg` - Azat Jalilov
- `anton.jpg` - Антон
- `arthur.jpg` - Arthur pandev.io
- `tair.jpg` - Tair Sab
- `nurlan.jpg` - Nurlan N
- `egor.jpg` - Egor
- `maxim.jpg` - Maxim Gorbatyuk
- `tolegen.jpg` - 鏥 Tоλеген

### Level 2 (Extended Network)
- `denis.jpg` - Denis
- `zhanar.jpg` - Zhanar Mustafina
- `daulet.jpg` - Daulet
- `iztleu.jpg` - Iztleu Darkhan
- `alex.jpg` - Alex Dukhnovskiy
- `rodion.jpg` - Rodion Mostovoi

## Image Specifications

- **Format**: JPG, PNG, or WebP
- **Size**: Minimum 200x200px (square)
- **Aspect Ratio**: 1:1 (square)
- **File Size**: Recommended under 100KB per image

## Fallback Behavior

If an avatar image is missing or fails to load:
- The component will display a colored circle with the person's initials
- Colors match the person's level (Yellow for Level 0, Blue for Level 1, Purple for Level 2)

## Adding New Avatars

1. Add the image file to this directory with the correct filename
2. Ensure the filename matches the `avatar` field in `/data/profiles.json`
3. Test the website locally to verify the image displays correctly
