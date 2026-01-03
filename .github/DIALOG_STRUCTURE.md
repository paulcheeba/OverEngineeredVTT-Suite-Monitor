# Dialog Structure Documentation

## Overview
This document explains how the DialogV2 structure works in the OEV Suite Monitor module.

## DialogV2 Architecture

Foundry VTT v13's `DialogV2` extends `ApplicationV2` and automatically creates a proper window structure:

```
┌─────────────────────────────────────┐
│ HEADER (automatic)                  │  ← Window title set via window.title
├─────────────────────────────────────┤
│                                     │
│ CONTENT (scrollable)                │  ← Our template renders here
│                                     │  ← Max-height controlled via CSS
│                                     │  ← Overflow-y: auto for scrolling
│                                     │
├─────────────────────────────────────┤
│ FOOTER (automatic)                  │  ← Buttons array renders here
└─────────────────────────────────────┘
```

## How It Works

### 1. JavaScript Configuration (monitor.js)
```javascript
const dialog = new foundry.applications.api.DialogV2({
  window: { 
    title: "OverEngineeredVTT Suite Monitor",  // → Renders in HEADER
    resizable: true
  },
  position: {
    width: 600,
    height: "auto"
  },
  classes: ["oev-suite-monitor-dialog"],  // Custom CSS class
  content,  // → Renders in CONTENT area
  buttons: [  // → Render in FOOTER
    { action: "hide", label: "Hide Until Update", icon: "fas fa-eye-slash", ... },
    { action: "snooze", label: "Remind Me Later", icon: "fas fa-clock", ... }
  ]
});
```

### 2. Template Structure (monitor.hbs)
The template uses semantic HTML5 elements:

```handlebars
{{#if outOfDate}}
<section class="oev-module-section oev-section-outdated">
  <header class="oev-section-header">
    <h2>Out of Date Modules</h2>
  </header>
  <div class="oev-module-cards">
    {{#each outOfDate}}
    <div class="oev-module-card">...</div>
    {{/each}}
  </div>
</section>
{{/if}}
```

**Key semantic elements:**
- `<section>` - Groups each module category
- `<header>` - Contains section title
- `<h2>` - Section heading (not to be confused with window header)
- `<div class="oev-module-cards">` - Container for module cards

### 3. CSS Styling (monitor.css)

#### Content Area Scrolling
```css
.oev-suite-monitor-dialog .window-content {
  max-height: 70vh;      /* Limit content height */
  overflow-y: auto;      /* Enable vertical scrolling */
  padding: 1rem;         /* Content padding */
}
```

#### Section Styling
```css
.oev-section-header {
  background: rgba(0, 0, 0, 0.05);
  border-bottom: 2px solid rgba(0, 0, 0, 0.2);
  padding: 0.5rem 0.75rem;
}

/* Color-coded sections */
.oev-section-outdated .oev-section-header {
  background: rgba(220, 53, 69, 0.1);    /* Red tint */
  border-bottom-color: rgba(220, 53, 69, 0.3);
}

.oev-section-updated .oev-section-header {
  background: rgba(40, 167, 69, 0.1);    /* Green tint */
  border-bottom-color: rgba(40, 167, 69, 0.3);
}

.oev-section-available .oev-section-header {
  background: rgba(0, 123, 255, 0.1);    /* Blue tint */
  border-bottom-color: rgba(0, 123, 255, 0.3);
}
```

## Section Priority

Sections are ordered by importance:
1. **Out of Date** - Most important, shown first
2. **Up to Date** - Informational
3. **Available** - Additional context

## Foundry's Automatic Elements

DialogV2 automatically provides:
- Window frame (header, content, footer)
- Title bar with close button
- Header controls (minimize, etc.)
- Button container in footer
- Form handling
- Drag/resize functionality
- Proper z-index management

## CSS Targeting

To style DialogV2 elements:
- `.oev-suite-monitor-dialog` - The entire dialog window
- `.oev-suite-monitor-dialog .window-content` - The scrollable content area
- `.oev-suite-monitor-dialog .window-header` - The header (automatic)
- `.oev-suite-monitor-dialog footer` - The button footer (automatic)

## Best Practices

1. **Don't override window structure** - DialogV2 handles header/footer automatically
2. **Use semantic HTML** - `<section>`, `<header>`, `<article>`, etc.
3. **Control scrolling via CSS** - Set max-height on `.window-content`
4. **Use CSS classes** - Add custom classes via the `classes` option
5. **Leverage Foundry CSS variables** - Use `--color-text-*` for theming

## Resources

- [Foundry v13 DialogV2 API](https://foundryvtt.com/api/v13/classes/foundry.applications.api.DialogV2.html)
- [Foundry v13 ApplicationV2 API](https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html)
