# THANXIE AI Brand Specification

## Source artwork
The project-owner-supplied Tom & Jerry sunset/heart artwork is the default THANXIE AI visual identity. It is stored at `assets/branding/thanxie-default.png`.

## Visual direction
- Theme: `sunset-heart`
- Primary: `#C62828` — heart/red accent
- Accent: `#FF8A3D` — sunset warmth
- Background: `#FFF8F0` — warm light
- Text: `#2B1B17` — dark readable text
- Mood: cute, warm, friendly, premium, community-focused

Every supported visual card must retrieve its image and theme through `getActiveBrandImage()`. Do not hard-code a card-specific image. If the active image is unavailable, render the text-only fallback.

## Owner branding controls
- `.setbotimage` — activate a new brand image through the supported media workflow
- `.branding` — show active branding status
- `.brandingstatus` — show active branding status
- `.resetbranding` — restore the supplied default artwork

The WhatsApp Business profile photo is a separate Meta Business Profile operation; a message media object is not automatically a profile photo.
