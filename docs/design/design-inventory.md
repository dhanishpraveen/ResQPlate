# ResQPlate design inventory

## Source and inspection record

The approved reference is present at `docs/design/ResQPlate_UI.pdf`. I rendered
and visually inspected all 53 pages in sequence. The PDF contains image-based
UI designs: text extraction returned no page text, so titles below are
transcribed from the rendered visuals. Small supporting copy, some values, and
fine icon details are not always legible at the supplied resolution; those
items are described rather than guessed. The page labels and role assignments
below follow the designs, correcting the provisional list where necessary.

This is a screen inventory, not evidence that any screen has been implemented.
The layouts shown are desktop designs; the PDF does not establish responsive
behavior at other viewports.

## Page-by-page inventory

Each entry records the visible screen title, role, purpose, major sections and
actions, navigation relationship, reusable patterns, and notable imagery or
uncertainty.

### Authentication and donor journey

1. **“Welcome Back!” — Shared sign-in.** Purpose: authenticate an existing
   user. Split composition: green illustrated brand panel with ResQPlate mark,
   rescue-food image, slogan and impact figures; white sign-in form with email,
   password/visibility, forgot-password link, Sign In, Google/Microsoft
   options, and sign-up link. Actions lead to authentication, recovery,
   provider sign-in, or registration. Establishes the split auth template,
   rounded fields, green primary button, and decorative fruit/leaf corners.
   Provider behavior and exact helper copy are not specified by the visual.
2. **“Create Your Account” — Shared registration and role choice.** Reuses the
   illustrated green/white split. The form shows full name, email, phone,
   password, role cards for Restaurant/Donor, NGO, and Volunteer, Sign Up, and
   a sign-in link. Role selection is an onboarding choice, not authorization.
   The illustration depicts a donor/recipient handoff with food and a delivery
   vehicle; exact field validation is not shown.
3. **“Verify Your Email” — Shared verification.** Green brand/phone-mail
   illustration beside an email verification form with six code boxes,
   Verify, resend-code countdown/action, and back-to-sign-in link. Reuses the
   split auth layout. Code format and expiry details are too small to establish.
4. **“Complete Your Profile” — Shared profile onboarding.** Split brand panel
   with volunteer illustration and a right-side progress stepper and
   “Your Details” form. Visible areas include avatar upload, name/email/phone
   verification indicators, address, About You, and Continue. The stepper
   suggests further onboarding. Exact step count/order beyond visible labels
   is not specified here.
5. **“Set Up Your Donor Profile” — Donor onboarding.** The same split
   onboarding composition, with restaurant storefront illustration and
   progress indicator. Right panel collects business/restaurant name,
   cuisine type, business address, operating hours, food-safety/food-donation
   information and a terms/conditions confirmation; Get Started continues to
   the donor dashboard. Field-level rules are not depicted.
6. **“Welcome, Spice Garden!” — Donor dashboard.** Desktop app shell:
   dark-green left navigation, white canvas, top-right notification/profile
   controls, welcome header, metric cards, prominent Create Donation action,
   recent-donation list, and impact chart/card. Navigation includes Dashboard,
   Create Donation, My Donations, Pickup Requests, Impact, Messages,
   Notifications, Profile, Settings, Logout. The content uses food thumbnails
   and a chart; metric labels are visible, but figures are sample design data.
7. **“Create a Donation” — Donor.** App shell with donation form grouped into
   Food Details, Quantity & Schedule, and Pickup Information. Visible controls
   cover food name/type, quantity, availability/pickup timing, and pickup
   details; a food photo and “Food Rescue Tips” panel sit alongside the form.
   Primary actions are Create Donation and Save as Draft. Returns to donor
   donation management; exact required fields and validation are not settled.
8. **“My Donations” — Donor.** App shell with status filter tabs and searchable
   donation rows/cards. Food thumbnails, donation names, quantities,
   recipients/statuses, and row actions such as Edit, Cancel, or View appear.
   Filters lead into each listing state; row actions lead to edit/details or
   cancellation. Reuses status pills, food rows, and compact action buttons.
   Fine filter names and status rules should be checked against the source
   during implementation.
9. **“Pickup Requests” — Donor.** App shell listing NGO/volunteer pickup
   requests, donation information and request status, with Confirm and Decline
   actions and an upcoming-pickup summary/card. Actions lead to request
   decision or pickup details. Reuses donation thumbnail rows and status
   treatments. The relationship between requests and delivery assignments is
   a product rule not resolved by the design.
10. **“Pickup Details & Handover” — Donor.** Detail view with donation and
    recipient/pickup information, pickup-status timeline, and actions to
    Confirm Handover or update/record pickup information. Reuses the app shell,
    status timeline, information cards, and green action buttons. The exact
    effects of handover confirmation require backend workflow definition.
11. **“Your Impact” — Donor impact overview.** App shell with period selector,
    summary cards for donations, food saved, people fed, and CO₂ reduction,
    plus donation trend and impact breakdown charts and a highlighted impact
    statement. Chart cards and metrics use the shared dashboard style. Values
    are illustrative; methodology and units must be approved separately.
12. **“Your Impact” — Donor impact reporting/detail.** A second impact screen
    with a period filter, summary statistics, donation-trend chart, cuisine
    breakdown, and further impact/verification metrics. It is visually
    distinct from page 11's overview despite sharing its title and sidebar
    destination. Clarify whether this is an alternate tab/detail state or a
    separate route before implementation; chart labels and sample totals are
    not authoritative.
13. **“Messages” — Donor.** Three-part app-shell messaging view: conversation
    list and role/category filters, selected conversation header with
    participant details, message history with food/donation context, and
    composer/attachment/send controls. Reuse across roles is suggested by the
    NGO and volunteer pages, but content and permitted participants differ.
    No delivery/read semantics can be inferred.
14. **“Notifications” — Donor.** App-shell notification list with category
    tabs/filters and entries for pickup request, pickup confirmation, donation
    completion, impact/reporting, and profile events; includes unread styling
    and row navigation. Reuse the notification list and status icon patterns
    for other roles. Notification delivery channels/preferences are not
    established here.
15. **“My Profile” — Donor.** App shell with tabs for Profile & Account,
    Restaurant Details, and Verification. Personal information and restaurant
    identity are separated; verification status and account actions appear in
    cards. Edit/update actions are visible. Reuse profile tab/card patterns;
    private contact details and verification documents need access controls.
16. **“Settings” — Donor.** App shell with settings subnavigation and a
    Notification Preferences panel containing event toggles (including
    donation, pickup, and impact updates); additional privacy/security/account
    categories are visible in the rail. Reuse settings rows and switches.
    Exact preference defaults and effects require product decisions.
17. **“Log Out?” — Donor logout confirmation dialog.** A centered confirmation
    modal overlays and dims the donor dashboard, with close icon, explanatory
    question, Cancel, and Log Out. This is a dialog state, not a standalone
    dashboard page; confirm closes session and cancel returns to the current
    screen. Dialog and backdrop are reusable. Only donor context is pictured.
18. **“NGO Sign Up” — NGO registration entry.** Split layout with green NGO
    food-rescue promotional panel, checklist/meal illustration and
    three-step progress indicator. Right-side Organization Details form
    begins NGO registration with organization identity/registration type,
    address, mission, and Next. Continues to page 19. Exact legal requirements
    and verification policy are not specified by visual copy.

### NGO journey

19. **“NGO Sign Up” — NGO registration, Organization Details step.** Repeats
    the NGO promotional split panel. Stepper highlights Organization Details;
    form collects organization identity/type, registration number, address,
    and organization description. Next advances to Contact Person Details
    (page 20). Field-level validation is not shown.
20. **“NGO Sign Up” — NGO registration, Contact Person Details step.** Same
    split panel and three-step stepper, with Contact Person Details active.
    Form captures contact person's name, email, role/designation, phone, and
    related contact details. Back returns to organization details; Next
    advances to verification (page 21). Personal-data visibility must be
    limited.
21. **“NGO Sign Up” — NGO registration, Organization Verification step.**
    Same registration frame with final step active. Form requests organization
    verification documents (including registration/tax-related evidence in
    visible labels) with upload controls, Back, and Submit for Verification.
    Leads to page 22. Document types and accepted formats are small/partly
    unreadable and require confirmation; uploaded records must remain private.
22. **“Verification Pending” — NGO.** Standalone, pale-green success/pending
    composition with verification-document icon, explanatory pending message,
    checklist/status rows, Go to Dashboard, and Explore the Platform. The
    buttons route into the NGO app; this is a status/confirmation state.
    Review timing and whether exploration is permitted pre-verification need
    policy decisions.
23. **“NGO Dashboard” — NGO.** Role-specific desktop app shell and top-right
    alerts/profile controls. Summary metrics across rescued food, requests,
    deliveries, and impact; new/nearby donations with food photos, a map-style
    nearby-donation panel, My Requests, and Your Impact cards. Sidebar:
    Dashboard, Available Donations, My Requests, My Deliveries, Impact,
    Messages, Notifications, Profile, Settings, Logout. Map data and metric
    definitions are not established by the mock.
24. **“Available Donations” — NGO.** App shell with search/filter controls
    and donation rows containing food photos, donor identity, food details,
    availability/status, View Details, and Request Pickup. Search and filters
    narrow the list; row actions lead to pages 25–26. Reuses donor food cards
    and status tags. Eligibility and geographic filtering are not specified.
25. **“Donation Details” — NGO.** Detail screen with food photograph, donor
    name, food type/quantity/availability summaries, pickup details, donor
    information, and handling notes; Request Pickup and Back actions. Request
    Pickup leads to page 26; donor contact/privacy and address disclosure
    timing are unresolved.
26. **“Request Pickup” — NGO.** Request form with selected donation summary,
    requested quantity, preferred pickup date/time, and optional additional
    notes beside a request summary card; Submit Pickup Request and Back.
    Submission leads to page 27. Quantity constraints, time-slot conflicts,
    and multi-request rules need implementation decisions.
27. **“Pickup Request Submitted!” — NGO success state.** Green confirmation
    check, submission explanation, request/food summary and pending status,
    with View My Requests and Go to Dashboard. These actions lead to page 28
    or the NGO dashboard. Reuses confirmation icon, pale-green cards, and
    primary/secondary action buttons.
28. **“My Requests” — NGO.** App shell with search and status tabs (including
    pending/approved/declined/completed states) and donation request rows.
    Rows show food/donor, quantity/time and status, with View Details
    navigation. Reuses request cards/status pills. Exact status vocabulary and
    cancellation behavior need confirmation.
29. **“My Deliveries” — NGO.** App shell with delivery-status filters and rows
    showing delivery/task reference, food/donor, volunteer, time, progress
    status, and detail affordance. Rows lead to page 30. Reuses delivery
    status chips and participant summaries. The design suggests role-specific
    delivery tracking but does not define assignment policy.
30. **“Delivery Details” — NGO.** Delivery overview with request reference,
    donation/food summary, volunteer details/contact actions, delivery timeline
    (approved, assigned, collected, in transit, delivered/receipt), pickup and
    drop-off information, plus a receipt action. Leads to receipt confirmation
    (page 31) when appropriate. Participant contact and location data need
    least-privilege handling.
31. **“Confirm Food Receipt” — NGO.** Receipt form with delivery summary,
    food quantity/quality check, optional notes and photo upload, pickup and
    delivery context, volunteer details, and Confirm Receipt. Confirmation
    leads to page 32. Exact quality criteria, partial receipt, and evidence
    requirements are unresolved.
32. **“Receipt Confirmed!” — NGO success state.** Checkmark, completed
    donation/delivery summary, food condition and receipt details, thank-you
    note, View Delivery Details, and Back to My Deliveries. Actions return to
    page 30 or 29. Reuses delivery completion confirmation pattern.
33. **“NGO Impact Dashboard” — NGO.** App shell with period selector, metrics
    for food received/people served/donations or deliveries, trend chart,
    category/cuisine breakdown, recent pickups, and organization impact
    overview. Charts and summary cards parallel donor reporting, with
    role-specific measures. Sample metrics are illustrative only.
34. **“Messages” — NGO.** Same three-column conversation list, selected
    conversation and composer pattern as page 13, with donor/volunteer
    participants and delivery context. Messages may relate to pickup and
    delivery coordination. Exact common component boundaries and participant
    permissions must be established.
35. **“Notifications” — NGO.** App-shell, filterable notification list with
    mark-all-as-read and event rows for request approval/decline, pickup
    scheduling/completion, new message, and account updates. Rows navigate to
    relevant requests/deliveries. Reuses page 14 pattern with NGO-specific
    event types.
36. **“Organization Profile” — NGO.** App shell with tabs for Organization
    Details, Documents, and Verification. Displays identity/contact details,
    verification status and uploaded-document rows, with Edit Profile.
    Reuses profile and status cards. Verification evidence must not be exposed
    via public URLs; approved edit/review authority is not depicted.
37. **“Settings” — NGO.** App shell with Notification Preferences, Security,
    Privacy, and Account Management sections. Toggles cover request/pickup,
    message or delivery events; account actions include profile/deactivation
    options. Reuses donor settings layout but shows NGO-related event types.
    Exact defaults and consequences need product approval.

### Volunteer journey

38. **“Volunteer Sign Up” — Volunteer.** Split composition with dark-green
    volunteer/food-handoff illustration panel and form for name, email,
    phone, password and password confirmation; Sign Up or Continue and a
    sign-in link. Leads into volunteer onboarding. The visual does not show
    identity checks or detailed availability setup.
39. **“Volunteer Dashboard” — Volunteer.** App shell with volunteer-specific
    sidebar, profile and notification controls, summary cards for completed
    deliveries/tasks/availability or earnings, ongoing tasks, quick actions,
    today's schedule, and an illustrated “Deliver Food, Spread Hope” panel.
    Sidebar includes Dashboard, Available Tasks, My Tasks, Earnings, Impact,
    Messages, Notifications, Profile, Availability, Settings, Logout. Sample
    values are not operational requirements.
40. **“Available Delivery Tasks” — Volunteer.** App shell with search/filter
    controls, task list rows displaying donor-to-NGO route, distance/food
    details, schedule and availability, plus Accept Task. Pagination is
    visible. Accept leads to page 42. Eligibility, task reservation, and
    simultaneous acceptance rules are not defined.
41. **“Delivery Task Details” — Volunteer.** Selected task summary, pickup
    and delivery route/times, route map/steps, instructions, contact-person
    actions, food-handling details and Accept Task. Back returns to available
    tasks; acceptance leads to page 42. Location disclosure and contact
    permissions should be restricted to assigned volunteers.
42. **“Task Accepted!” — Volunteer success state.** Checkmark confirmation,
    task and route summary, next-step callout to collect from donor by a
    displayed time, View My Tasks, and Navigate to Pickup. Leads to page 43
    or page 44. Reuses success panel and task summary; route/navigation
    provider is not established.
43. **“My Tasks” — Volunteer.** App shell with active/completed tabs and
    delivery-task cards. Active cards show workflow progress from accepted
    through pickup/delivery/receipt and actions such as pickup navigation;
    past tasks show completion and View Details. Reuses timeline/status
    elements from NGO delivery views. Exact task retention and cancellation
    rules are not shown.
44. **“TASK-2184 – Collect from Donor” — Volunteer task step.** Task-specific
    header and donor/pickup details with navigation/contact actions; progress
    stepper; food quantity/handling details; “Collected Food” confirmation
    checkbox and photo upload; Update Later and Confirm Pickup. Confirmation
    leads to page 45. Evidence and failed/partial pickup handling need
    definition.
45. **“Pickup Confirmed!” — Volunteer success state.** Checkmark, task/food
    quantity and donor-to-NGO summary, next step to deliver to NGO, route
    distance/time, View Task Details, and Navigate to NGO. Leads to page 46.
    Reuses confirmation summary and green next-step panel.
46. **“TASK-2184 – Deliver to NGO” — Volunteer task step.** Task-specific
    NGO/drop-off details and navigation/contact actions; progress stepper;
    food/quantity and handling information; handover details/photo upload;
    Update Later and Confirm Delivery. Confirmation leads to page 47.
    Recipient handoff evidence and disputes are unresolved.
47. **“Delivery Completed!” — Volunteer success state.** Checkmark and task
    summary with handover recorded, message that NGO confirmation completes
    the flow, View My Tasks and View Task Details. Returns to page 43 or
    task details. This explicitly distinguishes volunteer delivery completion
    from NGO receipt confirmation (page 31).
48. **“My Earnings” — Volunteer.** App shell with summary cards for total
    earnings, deliveries, pending reimbursements and paid/available balance,
    history period filter and transaction table with date/task/source/type,
    amount/status. Financial semantics and whether values are payments or
    reimbursements are not established by the design.
49. **“My Impact” — Volunteer.** App shell with delivery/food/people metrics,
    delivery activity bar chart and impact overview checklist/cards. Shared
    reporting visual language with role-specific measures. All displayed
    totals are sample values pending metric definitions.
50. **“Messages” — Volunteer.** Three-column app-shell messaging layout with
    participant/conversation filters, selected chat, task-specific message
    history, food/task context and composer. Reuses the message pattern from
    donor/NGO pages but includes volunteer task coordination. Participant
    authorization and message retention are not defined.
51. **“Notifications” — Volunteer.** Filterable app-shell notification list
    with mark-all-as-read and volunteer events such as new task availability,
    pickup reminder, handover/confirmation, schedule, and account update.
    Notification rows link to relevant task/profile screens. Reuses the
    shared notification pattern; channel and preference rules remain open.
52. **“Settings” — Volunteer.** App shell with General, Notifications,
    Security, Privacy, and Account categories. The visible General panel
    includes language, theme, distance-unit preferences, and toggles for task
    assignments, pickup/delivery reminders, messages, and earnings or
    reimbursement updates, with Discard Changes and Save Changes. Reuses the
    shared settings shell but has volunteer-specific preferences. The PDF
    includes a Profile navigation item but does not show a dedicated volunteer
    profile screen in its final-page sequence.
53. **“My Availability” — Volunteer (separate screen from Settings).** App
    shell with availability on/off switch and quick summary (days, time slots,
    service region/radius); tabs for Schedule, Service Area, and Preferences;
    selected weekday controls, editable time-slot rows, Add Time Slot,
    Discard Changes, and Save Availability. Sidebar highlights Availability;
    Settings is a separate navigation item. This corrects the provisional
    page-53 label: availability is its own page, not Settings.

## Shared design and navigation patterns

- **Authentication/onboarding:** pages 1–5 and 18–22 use a branded
  split-panel pattern. The left brand panel contains ResQPlate identity,
  green food-rescue illustration/photography, short mission copy and
  decorative leaf/fruit forms; the right panel contains a white form card or
  progress workflow. Page 22 is a standalone pending state.
- **Dashboard shell:** pages 6–17, 23–37, and 39–53 use a dark-green,
  icon-and-label left rail, white/light content canvas, top-right notification
  and profile controls, and compact rounded cards. Sidebar item names and
  ordering differ by role; do not merge access boundaries just because the
  shell is shared.
- **Donor navigation:** Dashboard, Create Donation, My Donations, Pickup
  Requests, Impact, Messages, Notifications, Profile, Settings, Logout.
- **NGO navigation:** Dashboard, Available Donations, My Requests, My
  Deliveries, Impact, Messages, Notifications, Profile, Settings, Logout.
- **Volunteer navigation:** Dashboard, Available Tasks, My Tasks, Earnings,
  Impact, Messages, Notifications, Profile, Availability, Settings, Logout.
- **Messages:** pages 13, 34, 50 share a three-column conversation list/chat/
  composer layout; task or donation context and participants differ.
- **Notifications:** pages 14, 35, 51 share filterable event rows and unread
  styling; available event categories and routes are role-specific.
- **Profiles/settings:** pages 15–16 and 36–37 show donor/NGO profile and
  settings variants. Volunteer page 52 is Settings and page 53 is My
  Availability; although the sidebar offers Profile, a dedicated volunteer
  profile design is not present in the 53-page sequence.
- **Donation-to-delivery flow:** donor listing (7–8) → NGO browse/details
  (24–25) → request (26–27) → donor review/handover (9–10) → volunteer task
  availability/acceptance (40–42) → collection (44–45) → delivery
  (46–47) → NGO delivery tracking and receipt (29–32). Messages/notifications
  can support these transitions. The mockups do not resolve request conflicts,
  assignment authority, status transition rules, or partial/failure cases.
- **Potential ambiguity:** donor pages 11–12 both show “Your Impact” but have
  different report compositions; determine whether one is a detail/tab state.
  NGO registration appears as an entry on page 18 and continues in the
  multi-step forms on 19–21. Volunteer delivery completion (47) is not the
  same as NGO receipt confirmation (31–32). The provisional page-52 profile
  label was incorrect: the actual page is Settings; My Availability is the
  separate page 53.

## Visual system inventory

The following are visual observations, not extracted design tokens. All pages
are image-based, so exact original values cannot be recovered from text or
font metadata:

- **Palette:** dominant deep forest/emerald greens for app navigation and
  illustration panels; brighter saturated green for primary actions and
  status; pale mint/green surfaces; white/light-neutral page backgrounds;
  yellow/lime accents and occasional orange/red status accents. Exact hex
  values are not asserted.
- **Typography:** clean, rounded-looking sans-serif appearance with bold
  headings, compact labels, and smaller muted explanatory copy. Original font
  family and weights are not established by the reference image.
- **Hierarchy:** prominent screen heading and small subtitle, section
  headings, compact metric labels/values, then status/help text.
- **Buttons and controls:** rounded rectangular filled green primary actions;
  white/outlined secondary actions; small colored status pills; rounded
  bordered inputs, segmented tabs/filters, switches, checkboxes, and icon
  buttons.
- **Cards:** white cards on a very light canvas, subtle gray/green borders or
  shadows, moderate rounded corners and compact spacing; pale green callouts
  highlight progress or impact.
- **Navigation/header:** fixed-looking dark-green left rail with small
  illustrated/line icons and active-item bright-green highlight; content
  header with notification bell and avatar/profile area.
- **Icons/illustration:** simple green line/filled UI icons; food thumbnails
  (prepared meals, produce, packaged items); friendly flat/vector people,
  delivery and food-rescue illustrations; small leaf/fruit decorations.
- **Forms:** labels above rounded fields, green action buttons, optional
  helper/validation indicators, split onboarding forms with stepper and
  progress state.
- **Imagery:** food photographs in listings, donor/NGO/volunteer illustrations
  in onboarding and success states, charts and map-style panels on dashboards.
  No original image files were separately supplied for extraction.
- **Responsive behavior:** not evidenced; the reference shows desktop
  compositions only. Do not infer mobile breakpoints from these images.

Record measured color values only after sampling the actual reference and
label any derived values as estimates. Do not claim exact font or asset matches
without independent source evidence.

## Asset recovery and remaining questions

The PDF was rendered for inspection. No separate source image/font assets were
included in the repository, and the designs appear flattened/rasterized; no
original asset extraction or font identification is claimed. If assets are
recovered later, record their origin, source page, and extraction quality.
Clarify the two donor impact designs, exact sample metric definitions, role
verification rules, and workflow edge cases before implementing behavior.
