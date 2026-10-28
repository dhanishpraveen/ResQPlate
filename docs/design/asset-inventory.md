# ResQPlate asset inventory

## Inspected sources

The repository includes the approved image-based design reference at
`ResQPlate_UI.pdf`. No independent logo, illustration, icon, photograph, font,
or source design bundle was present under `public/images/` or `src/`. The
reference pages were rendered for visual inspection; embedded screen imagery
is flattened into page compositions and does not provide clean, independently
usable assets. Complete page screenshots are not used as application UI.

## Inventory

| Asset | Source | Intended use | Status / provenance |
| --- | --- | --- | --- |
| ResQPlate logo/wordmark | Reference pages 1-53 | Authentication identity and app shell | No standalone original logo file recovered. `BrandMark` is a text wordmark with a generic Lucide sprout symbol; documented approximation, not an original logo. |
| Authentication illustrations | Reference pages 1-5 and 18-21 | Branded side panel for sign-in/onboarding | Original illustration files unavailable; no substitute illustration claimed. `AuthLayout` displays a visibly labelled CSS placeholder. |
| Food photographs | Donor/NGO listing pages and dashboards | Donation thumbnails and food-detail cards | No standalone photos supplied. `FoodListingCard` displays a labelled placeholder when no image is passed. Do not select unrelated stock imagery without documenting its source and approval. |
| Volunteer/donor/recipient artwork | Reference pages 2, 4-5, 38-39, 42, 45, 47 | Onboarding and success panels | No clean original files recovered; placeholders only where layout requires a visual region. |
| Profile portraits | Profile and header reference screens | User avatars | Original portraits unavailable. `Avatar` supports supplied images and otherwise uses initials; no real person image is fabricated. |
| Interface icons | Reference pages, multiple | Navigation, actions, status and metrics | Original icon assets unavailable. A consistent Lucide icon set is used as a documented visual approximation, not as the reference's original icon artwork. |
| Typography | Flattened visual reference | Application text | Font identity cannot be reliably extracted from page images; system fallback stack documented in `design-system.md`. |

## Current asset policy

No unverified image assets were copied into `public/images/`. Place future
recovered or properly licensed assets there with source page, original source,
license/permission, intended usage, and crop/aspect-ratio guidance recorded in
this inventory. Keep private user uploads out of the static public asset
folder. Preserve source proportions and avoid claiming substitutes are exact
matches. Do not embed full-page PDF renderings as interactive screens.
