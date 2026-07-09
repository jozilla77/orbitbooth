---
name: Haru Pop
colors:
  surface: '#fdf9f0'
  surface-dim: '#dddad1'
  surface-bright: '#fdf9f0'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f3ea'
  surface-container: '#f1eee5'
  surface-container-high: '#ece8df'
  surface-container-highest: '#e6e2d9'
  on-surface: '#1c1c17'
  on-surface-variant: '#5b4041'
  inverse-surface: '#31312b'
  inverse-on-surface: '#f4f0e8'
  outline: '#8f6f70'
  outline-variant: '#e3bebe'
  surface-tint: '#ba1537'
  primary: '#b71135'
  on-primary: '#ffffff'
  primary-container: '#da314b'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb3b5'
  secondary: '#006687'
  on-secondary: '#ffffff'
  secondary-container: '#5fcdff'
  on-secondary-container: '#005572'
  tertiary: '#705d00'
  on-tertiary: '#ffffff'
  tertiary-container: '#caa800'
  on-tertiary-container: '#4c3e00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdada'
  primary-fixed-dim: '#ffb3b5'
  on-primary-fixed: '#40000b'
  on-primary-fixed-variant: '#920025'
  secondary-fixed: '#c1e8ff'
  secondary-fixed-dim: '#73d1ff'
  on-secondary-fixed: '#001e2b'
  on-secondary-fixed-variant: '#004d66'
  tertiary-fixed: '#ffe173'
  tertiary-fixed-dim: '#e8c426'
  on-tertiary-fixed: '#221b00'
  on-tertiary-fixed-variant: '#554500'
  background: '#fdf9f0'
  on-background: '#1c1c17'
  surface-variant: '#e6e2d9'
typography:
  display-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 26px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  label-bold:
    fontFamily: Rubik
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  display-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 38px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  unit: 8px
  container-padding: 24px
  gutter: 16px
  safe-area: 32px
---

## Brand & Style

This design system is built on the pillars of **Kawaii Culture** and **Tactile Playfulness**. It aims to evoke a "Sunny Day" emotional response—optimistic, high-energy, and deeply rewarding. The aesthetic combines the clean, character-driven charm of Japanese mascot design with the hyper-polished, "juicy" feedback systems found in elite mobile puzzle games.

The visual style is **Tactile & Glossy**, characterized by:
- **Depth and Dimension:** Using multi-layered gradients and specular highlights to make UI elements feel like physical, high-end vinyl toys.
- **Micro-interactions:** Every interaction should feel "bouncy" and elastic, mimicking the physics of a soft, squishy object.
- **Polished HD Texture:** Utilizing subtle inner glows and 4K-ready vector gradients to create a premium, collectible feel for every interface component.

## Colors

The palette is inspired by a vibrant Japanese summer. It utilizes high-chroma tones to drive engagement and maintain a high-definition "pop" against varied backgrounds.

- **Sakura Pink (Primary):** Derived from the brand's core identity, used for high-importance actions, hearts, and premium currency.
- **Sky Blue (Secondary):** Used for navigation, informative panels, and secondary interactive states.
- **Sunny Yellow (Tertiary):** Reserved for rewards, stars, and celebratory highlights.
- **Lush Green (Success):** Utilized for "Go" buttons, progression indicators, and confirm actions.
- **Creamy Parchment (Neutral):** A soft, warm off-white used for container backgrounds to reduce eye strain while maintaining the sunny theme.

All interactive colors must feature a three-step gradient: a highlight top, a saturated mid-tone, and a weighted bottom shadow to reinforce the 3D effect.

## Typography

Typography in this design system is designed to be "chunky" and friendly. We prioritize high legibility to ensure information is processed quickly during fast-paced gameplay.

**Styling Rules:**
- **Headline Treatments:** Major headlines should utilize a thick, dark-colored stroke (2pt to 4pt) and a subtle "drop-shadow" effect using a darker version of the font color to make text pop off the screen.
- **Color Usage:** Avoid pure black (#000). Use deep navy or rich espresso for text to maintain the warmth of the design system.
- **Rounding:** Font families have been selected for their open counters and rounded terminals, echoing the shape language of the UI.

## Layout & Spacing

The layout philosophy follows a **Contextual Fluid Grid** that prioritizes "Safe Zones" for thumb-based interaction on mobile devices.

- **Rhythm:** We use an 8px base unit. All margins and paddings should be multiples of 8.
- **The Center Stage:** Game content is typically centered, with UI "Ornaments" (Score, Menu, Lives) anchored to the corners with a 32px safe-area margin.
- **Breakpoints:**
  - **Mobile:** Single column, focused layout. Margins are 16px.
  - **Tablet/Landscape:** Split layout where score panels and menus move to the lateral sides to clear the central play area.

## Elevation & Depth

Depth is not achieved through traditional shadows, but through **Tonal Extrusion** and **Specular Highlights**.

- **The Extrusion Effect:** Instead of a blur, use a solid-color offset (usually 4px to 8px downwards) in a darker shade of the element’s primary color. This gives the appearance of a physical button or tile.
- **Glossy Overlays:** Every interactive card or button features a "sheen"—a semi-transparent white gradient or ellipse at the top 30% of the shape.
- **Ambient Softness:** Background panels use a very large, low-opacity (10-15%) colored shadow that matches the background hue, creating a soft "glow" rather than a dark shadow.

## Shapes

The shape language is strictly **Hyper-Rounded**. There are no sharp corners in this design system. 

- **Primary Radius:** Everything uses pill-shaped or heavily rounded corners (minimum 16px).
- **Blob Philosophy:** Secondary decorative elements and container backgrounds should utilize "organic blobs"—slightly asymmetrical rounded shapes—to enhance the "Kawaii" character-driven aesthetic.
- **Internal Nesting:** When nesting elements (like a progress bar inside a frame), the inner radius should be half of the outer radius to maintain visual harmony.

## Components

### Glossy Buttons
Buttons are the "hero" components. They must feature a dark bottom extrusion (the "base") and a bright top gradient. On press, the button should translate 4px downwards, visually "covering" the extrusion to provide tactile feedback.

### Bubbly Progress Bars
Bars should be thick and "filled" with a liquid-like gradient. The "handle" or current progress point should be an oversized, circular icon or character head that sits slightly outside the bar's boundaries.

### 4K Texture Cards
Information panels should feel like physical objects. Use subtle patterns (dots, diagonal stripes, or gingham) at 5% opacity to give the surface a "textured" feel. Frames should be thick and feature an inner glow.

### Ornate Score Panels
Score containers should be embellished with "ears" or "wings" (e.g., small clouds or character-inspired nubs) to break the rectangular silhouette and make the UI feel integrated into the game world.

### Checkboxes & Radios
These are reimagined as "Toggles" or "Stickers." A checked state should trigger a small "puff" animation (scaling up and down) with a vibrant color change to Sunny Yellow or Lush Green.