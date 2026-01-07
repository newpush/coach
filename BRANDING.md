# Coach Watts Brand Identity & Style Guide

This document serves as the official branding reference for **Coach Watts**, an AI-powered endurance coaching platform. Use these guidelines when generating content, designing assets, or configuring third-party services to ensure a consistent brand experience.

---

## 1. Core Identity

- **Brand Name:** Coach Watts
- **Slogan:** AI-powered endurance coaching that adapts to you.
- **Mission:** To provide professional-grade, data-driven cycling coaching through accessible AI technology.
- **Tone of Voice:** Professional, encouraging, scientific, and precise. Avoid overly aggressive "drill sergeant" tropes; focus on sustainable growth and data-backed insights.

---

## 2. Visual Palette

### Primary Brand Colors

The "Coach Watts Green" is the primary identifier.

| Color                     | Hex Code  | Tailwind / Nuxt UI | Usage                           |
| :------------------------ | :-------- | :----------------- | :------------------------------ |
| **Brand Green (Primary)** | `#00DC82` | `primary-400`      | Accents, Icons, Call to Action  |
| **Action Green**          | `#00C16A` | `primary-500`      | Primary Buttons, Main Branding  |
| **Deep Green**            | `#00A155` | `primary-600`      | Hover states, Dark mode accents |

### Neutral Colors

| Color                  | Hex Code  | Tailwind Name | Usage                       |
| :--------------------- | :-------- | :------------ | :-------------------------- |
| **Background (Light)** | `#FFFFFF` | `white`       | Page background             |
| **Background (Dark)**  | `#09090b` | `zinc-950`    | Page background (Dark mode) |
| **Text (Primary)**     | `#09090b` | `zinc-900`    | Body text, Headers          |
| **Text (Muted)**       | `#71717a` | `zinc-500`    | Subtitles, labels           |

### Semantic State Colors

- **Success:** `#22c55e` (Green-500) — High recovery, goal reached.
- **Warning:** `#f59e0b` (Amber-500) — Moderate fatigue, caution.
- **Error/Effort:** `#ef4444` (Red-500) — Low recovery, extreme intensity.
- **Info/Wellness:** `#6366f1` (Indigo-500) — General health metrics.

---

## 3. Typography

- **Primary Font:** `Public Sans`
  - _Fallback:_ `Inter`, `system-ui`, `sans-serif`.
- **Style Rules:**
  - **Headings:** Bold with tight tracking (`tracking-tight`).
  - **Labels:** Small (`text-xs`), Extra Bold, Uppercase with wide tracking (`tracking-widest`).
  - **Data Values:** Tabular numbers (`tabular-nums`) to ensure vertical alignment in tables.

---

## 4. Design Elements

- **Corner Radius:** `12px` (`rounded-xl`) is the standard for cards and buttons.
- **Shadows:** Subtle shadows (`shadow-sm`).
- **Borders:** Thin, high-contrast rings (`ring-1 ring-gray-200` or `ring-gray-800`).
- **Gradients:**
  - _Standard UI Gradient:_ `linear-gradient(135deg, #00DC82 0%, #00C16A 100%)`

---

## 5. Content & AI Guidelines (for LLMs)

When generating content for Coach Watts (reports, chat responses, or emails), adhere to these formatting rules:

### Structure

- **Headers:** Use Markdown headers (`##`, `###`) for clear hierarchy.
- **Emphasis:** Use **bolding** for key metrics (e.g., "**285W FTP**").
- **Lists:** Use bullet points for actionable recommendations.

### Tone

- **Data-First:** Always reference specific data (HRV, TSS, Power) before giving advice.
- **Contextual:** Acknowledge the user's recent history (e.g., "After your hard intervals yesterday...").
- **Educational:** Briefly explain _why_ a metric matters (e.g., "Your HRV is low, indicating your nervous system needs more recovery").

---

## 6. Iconography

- **Library:** Heroicons (Outline/Solid).
- **Style:** Consistent 20px or 24px sizing. Use icons to reinforce category identity (e.g., ⚡ for Power, 🌙 for Sleep, 🥗 for Nutrition).
