# ResQPlate design system

## Status and source

This design system is based on visual inspection of the image-based desktop
reference in `ResQPlate_UI.pdf`, especially sign-in and onboarding pages 1-5,
donor application pages 6-16, NGO pages 23-37, and volunteer pages 39-53.
The images do not expose source design tokens. Values below are practical
visual estimates, not measured originals. No original font family or separate
image/font bundle was supplied. Read `asset-inventory.md` for the asset
limitations and current placeholders.

The page composition follows a deep-green navigation rail, light neutral
workspace, white content cards, compact headings and labels, green primary
actions, pale-green highlights, small status pills, and rounded form controls.
Authentication uses a green illustrated brand panel beside a white form
surface. The desktop reference is the fidelity target; responsive rules are
implementation adaptations because mobile layouts are not depicted.

## Tokens

Runtime tokens are centralized in `src/styles/tokens.css`; global element
rules are in `src/styles/globals.css` and `src/styles/typography.css`.

| Token group | Representative tokens | Visual role | Confidence |
| --- | --- | --- | --- |
| Brand greens | `--color-brand-950` through `--color-brand-500` | Deep sidebar, identity panel, primary actions, highlights | Estimated from rendered screen images |
| Pale surfaces | `--color-brand-100`, `--color-brand-50` | Success callouts, icon fields, selected/hover states | Estimated |
| Workspace surfaces | `--color-page`, `--color-surface`, `--color-surface-muted` | Light canvas, cards/forms, muted content | Estimated |
| Text/borders | `--color-text`, `--color-text-secondary`, `--color-text-muted`, `--color-border` | Headings, supporting copy, separators | Estimated |
| States | `--color-success`, `--color-warning`, `--color-danger`, `--color-info` and surfaces | Status, validation, informational messages | Conventional accessible starting values; not measured from original |
| Typography | `--font-sans`, `--text-xs` through `--text-3xl`, line-height tokens | UI hierarchy | Sizes are estimates; family is a system fallback |
| Spacing | `--space-1` through `--space-12` | Consistent forms, cards, and layouts | Consistent implementation scale, not a recovered source scale |
| Shape/elevation | `--radius-*`, `--shadow-card`, `--shadow-raised`, `--shadow-dialog` | Soft cards, compact controls, modal elevation | Estimated |
| Layout | `--sidebar-width`, `--header-height`, `--content-max` | Desktop navigation, workspace header, page width | Estimated from reference proportions |

### Color and state guidance

Use the deep brand range for sidebar and strong branded surfaces; use the
bright primary green for main actions and active navigation. Reserve pale mint
surfaces for supportive emphasis rather than large competing panels. Maintain
clear contrast for white-on-green and dark text on light cards. Status meaning
must remain explicit in text; do not communicate it by color alone.

### Typography

The reference looks like a compact, modern sans-serif with bold headings and
small muted metadata. The original font cannot be reliably identified from the
flattened raster pages, and no font file was supplied. The implementation uses
`Inter, "Segoe UI", Arial, sans-serif` as a defensible fallback stack; this is
not claimed as an exact match. The hierarchy is: page title, section heading,
body, field label, then caption/metadata.

### Layout and components

- **Workspace:** a dark-green fixed-width desktop sidebar, a white sticky
  header with notification/profile controls, and a light page canvas.
- **Navigation:** compact icon-and-label items, bright-green active state,
  unread notification marker, and a role-specific item order.
- **Cards:** white, thin muted-green/gray border, moderate rounded corners,
  restrained shadow, compact padding and even gaps.
- **Forms:** labels above rounded white controls; clear focus rings, required
  indicators, helper copy and error messages. Password fields include a
  visibility toggle.
- **Actions:** filled green primary, pale-green secondary, white outlined,
  destructive red, and quiet/ghost variants, with small/medium/large sizes and
  disabled/loading treatment.
- **Badges and indicators:** compact colored status pills, simple icon
  containers, avatars, metric cards, semantic alerts, and a progress timeline.
- **Dialogs:** native modal dialog for keyboard handling and focus management,
  with a dimmed backdrop and explicit confirm/cancel controls.
- **Authentication:** split green identity panel/form on wide viewports,
  collapsing to a form-first layout on narrow screens. The missing reference
  illustration is explicitly marked as a placeholder rather than imitated.

## Shared component inventory

Implementation lives in `src/components/ui.tsx`, `src/components/layout.tsx`,
and `src/components/navigation.ts`.

- `Button`, `IconButton`, and variants/sizes/loading/disabled states
- `TextField` (text, email, phone and password), `TextareaField`,
  `SelectField`, `Checkbox`, `RadioGroup`, `SwitchToggle`
- `Card`, `StatCard`, `StatusBadge`, `Avatar`, `IconContainer`,
  `SectionHeading`
- `EmptyState`, `LoadingState`, `ErrorState`, `InlineAlert`,
  `ConfirmationDialog`
- `FoodListingCard`, `ProgressTimeline` for recurring food and delivery
  presentation without workflow or persistence logic
- `AppShell`, `AuthLayout`, `PageContainer`, `PageHeader`, and role-specific
  navigation configuration

The interactive root view is a design-system component preview, not a
dashboard or production workflow. It exists to inspect shared components and
is expected to be replaced or routed appropriately in a later requested phase.

## Responsive and accessibility behavior

The desktop shell remains the primary target. Under the tablet/mobile
breakpoints, the sidebar becomes an accessible toggleable drawer, multi-column
previews collapse, and auth content becomes a single column. Shared controls
use semantic buttons, native inputs, associated labels, fieldset/legend for
radio groups, described validation text, visible focus, native dialog
semantics, reduced-motion handling, and text status labels. Verify the
implemented accessibility behavior with keyboard/screen-reader review when
accessibility tooling is added.

## Unresolved visual differences

- Original font, exact color values, original logo/vector, individual
  illustrations, food photos, and profile portraits are not separately
  available.
- The default auth brand art is an explicitly labelled CSS placeholder with a
  generic sprout mark, not original artwork.
- The design preview uses generated initials in place of example profile
  photographs. Food cards without a supplied photo show a labelled placeholder.
- Mobile navigation and breakpoints are adaptations; the reference only shows
  desktop screens.
- No pixel-perfect comparison is claimed. The token values should be revisited
  if original assets or higher fidelity design source files become available.
