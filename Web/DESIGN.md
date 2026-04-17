# Design System Specification: High-Tech Editorial AI

## 1. Overview & Creative North Star: "The Neon Architect"
The Creative North Star for this design system is **"The Neon Architect."** 

This system moves beyond the utilitarian density of standard IDEs to create an environment that feels like a high-end digital atelier. We are eschewing the "boxed-in" feel of traditional coding tools in favor of **Organic Precision**. By leveraging deep tonal depth and intentional asymmetry, we create a UI that feels less like a spreadsheet and more like a sophisticated command deck. 

The design breaks the "template" look through:
*   **Tonal Sectioning:** Eliminating borders to allow the eye to move fluidly between logic blocks.
*   **Layered Translucency:** Using glassmorphism to imply that the AI is a fluid, living layer "above" the static code.
*   **Typography Tension:** The interplay between the brutalist geometry of *Space Grotesk* and the humanist readability of *Manrope*.

## 2. Colors & Surface Philosophy
The palette is rooted in `surface` (#0c0e17)—a deep, "ink-pool" blue-black that provides infinite depth for the vibrant neon accents to vibrate against.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders for sectioning panels or containers. Structural integrity must be achieved through background shifts.
*   **Sidebars:** Use `surface_container_low` (#11131d) against a `surface` background.
*   **Floating Panels:** Use `surface_container_high` (#1c1f2b) to create natural separation.
*   **Active Logic Blocks:** Use `surface_container_highest` (#222532) to draw focus.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of semi-polished obsidian sheets.
1.  **Base Layer:** `surface` (Main editor background).
2.  **Inset Layer:** `surface_container_lowest` (Terminal or console outputs).
3.  **Elevated Layer:** `surface_container` (Navigational elements).
4.  **Action Layer:** `surface_container_highest` (Active file tabs or focused AI chat bubbles).

### The "Glass & Gradient" Rule
To elevate the tool from "utility" to "premium," main interactive elements must use:
*   **AI Accents:** Use a linear gradient of `primary` (#9ba8ff) to `secondary` (#a68cff) for primary call-to-actions.
*   **Glassmorphism:** For floating command palettes, use `surface_bright` at 60% opacity with a `24px` backdrop-blur. This ensures the underlying code remains a ghostly presence beneath the UI.

## 3. Typography: The Technical Editorial
We utilize two distinct families to balance the "Tech" and the "Tool."

*   **Display & Headlines (Space Grotesk):** Used for high-level UI labels and headers. Its geometric quirks reflect the "AI" personality—precise yet futuristic.
*   **Body & Titles (Manrope):** A highly legible sans-serif for settings, documentation, and chat interfaces.
*   **Code (Monospace):** (User-selected mono font) should be used exclusively for the editor and inline code snippets.

**Hierarchy Strategy:**
*   **Display-LG (3.5rem):** Use for empty states or "AI Thinking" splash screens.
*   **Headline-SM (1.5rem):** For major module headers (e.g., "Project Explorer").
*   **Label-MD (0.75rem):** For metadata, using `on_surface_variant` (#aaaab7) to keep the UI clean.

## 4. Elevation & Depth
Depth is a functional tool, not a stylistic flourish. It signals the "priority" of information.

### The Layering Principle
Instead of shadows, use "Tonal Lifting."
*   A `surface_container_low` sidebar should sit adjacent to a `surface` editor. 
*   A "Pop-over" should use `surface_container_highest` to create an immediate visual break.

### Ambient Shadows
If an element must float (e.g., a context menu):
*   **Shadow Color:** Use a tinted shadow based on `surface_container_lowest` (#000000) at 40% opacity.
*   **Spec:** `0px 12px 32px rgba(0, 0, 0, 0.4)`. The shadow must be wide and soft, mimicking a light source directly above the screen.

### The "Ghost Border" Fallback
If a visual divider is required for accessibility:
*   Use `outline_variant` (#464752) at **15% opacity**. It should be felt, not seen.

## 5. Components

### Buttons
*   **Primary:** A gradient from `primary_dim` to `secondary_dim`. Roundedness: `md` (0.375rem). No border.
*   **Secondary:** `surface_container_high` background with `on_surface` text.
*   **Tertiary (Ghost):** Transparent background, `primary` text. Use for low-emphasis actions like "Dismiss."

### Chips (AI Tags)
*   **Style:** Use `surface_variant` (#222532) with a `primary` #9ba8ff left-accent 2px "indicator" instead of a full border. Use `label-sm` for text.

### Input Fields (The AI Command Bar)
*   **Default:** `surface_container_low`. Roundedness: `lg` (0.5rem).
*   **Focused:** Transition to `surface_container_high`. A `2px` glow using `primary` at 20% opacity should emanate from the container—no hard outlines.

### Cards & Lists
*   **The No-Divider Rule:** Forbid 1px dividers between list items. Use 8px of vertical whitespace or a subtle background shift on `:hover` using `surface_bright` (#282b3a).

### Specialized Component: "The Syntax Ghost"
For the AI code-diffing view, use `tertiary_container` (#f98fdc) at 10% opacity for additions and `error_container` (#a70138) at 10% for deletions. This keeps the "vibrant" theme consistent without overwhelming the developer's eyes.

## 6. Do’s and Don’ts

### Do
*   **Do** use `primary_fixed` for active states in the sidebar to create a "Neon" glow against the dark background.
*   **Do** leverage `0.75rem` (xl) roundedness for large containers to soften the "industrial" feel.
*   **Do** use `on_surface_variant` for inactive code or comments to ensure the hierarchy remains on the logic.

### Don’t
*   **Don’t** use pure white (#ffffff) for text. Always use `on_background` (#f0f0fd) to reduce eye strain in dark mode.
*   **Don’t** use "Drop Shadows" on buttons or chips. Keep them flat and integrated into the surface stack.
*   **Don’t** use high-contrast borders for tabs. Use a `2px` bottom-border of `primary` only on the *active* tab.