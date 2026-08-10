# SkyLog — Flying Logbook PWA

A simple offline-first flying logbook built with vanilla HTML, CSS and JavaScript.

## Features

- Responsive mobile/desktop UI
- Add, edit and delete flights
- Depart and Arrival times recorded in GMT
- Separate take-off and landing counts
- Flight time calculated automatically, displayed to the nearest 0.1 hour
- Midnight-crossing flights are supported
- IndexedDB local storage
- Dashboard with total/PIC/night/landing statistics
- Search and year filtering
- Aircraft statistics
- JSON export/import
- Installable PWA
- Offline caching through a service worker

## Run locally

A service worker generally requires `localhost` or HTTPS. From this folder:

```bash
python3 -m http.server 8000
```

Then open:

`http://localhost:8000`

## Important

The app stores data in the browser's IndexedDB. Export backups regularly before clearing browser storage or moving to another device.

This is an MVP data model; adapt fields and calculations to your preferred aviation authority/logbook format before using it as an official record.

- Pilot roles: P.1, P.1/S, P.2 and P.U/T
- Flight rules: VFR or IFR

- Aggregate flight-time statistics sum each flight's displayed 0.1-hour value, matching the individual logbook entries.

- Statistics date filters: All time, Previous 90 days, and Custom date range.

- Improved iPad/Safari form sizing for date and time fields.

- In-app Check for updates button that updates the service worker without clearing IndexedDB flight data.

- Further iPad/Safari date and time field sizing fixes using shrinkable grid tracks and native-control constraints.

- Compact custom DD/MM/YYYY and HH:MM flight-entry fields for consistent iPad/desktop sizing.
- Clear confirmation after a successful in-app update.

- Removed date/time placeholders so new entries open with clean fields.
- Update success confirmation now persists through the app restart and remains visible in Settings.

- New flight date and time fields start blank and show DD/MM/YYYY and HH:MM placeholders; existing flights still populate their saved values when edited.

- Aircraft Classes settings: create, rename, delete classes and add/remove aircraft types within each class.

- Fixed IndexedDB upgrade so Aircraft Classes are available to existing installations without deleting flight data.

- Aircraft Classes moved to a dedicated page accessible from Settings.

- Settings renamed and simplified; Aircraft Classes and Data & Backup now open on dedicated pages.

- Fixed dedicated Settings sub-page navigation for Aircraft Classes and Data & Backup.

- Robust delegated navigation for Settings sub-pages.

- Fixed Settings sub-page buttons using direct, reliable navigation handlers.

- Updated SkyLog aircraft-themed app icons.
- Added subtle horizontal padding to the Aircraft Classes intro and create-class controls.

- Aircraft Classes create controls matched to the class controls; empty class list no longer displays placeholder text.

- Added clear horizontal inset to the Aircraft Classes intro and create-class controls inside the panel.

- Matched the Aircraft Classes create row vertical spacing to the horizontal inset.

- Fixed empty Aircraft Classes panel spacing on all sides.
- Improved Home Screen PWA update behaviour with network-first app-shell fetching and immediate service-worker activation.

- Replaced the topbar branding with a newly generated, fully visible SkyLog horizontal logo and made it a Home link.

- Improved iPad Home Screen PWA update lifecycle: waits for the new service worker to install, activates it, waits for controllerchange, reloads, and shows a persistent success confirmation.

- Fixed SkyLog logo home navigation to target the dashboard view.

- Stats breakdown selector for By Aircraft / By Class, with decimal hours and day/night/total take-offs and landings.
- Flight entry records day/night take-offs and landings separately, with backward compatibility for existing flights.

- Removed the duplicated stats Breakdown control and matched aircraft/class selector buttons to the existing stats filter-button theme.

- Aircraft/Class selector buttons now use the exact same styling values as the All time/Previous 90 days stats filter buttons.

- Aircraft/Class selectors are now in a matching panel and use the existing filter-btn class for identical styling to the date-range filters.

- Unified normal app button styling across the UI and removed unused icon image assets.
- Removed duplicate Statistics Breakdown control.

- Removed legacy Aircraft/Class button CSS overrides so their buttons now use only the shared filter-btn styling.

- Added consistent internal padding to Statistics containers and uniform gaps between the selector container and stats bubbles.

- Fixed asymmetric top/bottom spacing around Statistics range buttons and added a uniform gap between Breakdown text and its dropdown.

- Matched Statistics date-range container padding exactly to the Aircraft/Class selector container.

- Removed the Statistics range summary text and fixed the dynamically rendered Breakdown dropdown so it switches correctly between aircraft and class buttons.

- Restored the Statistics date-range container gap and fixed the Breakdown dropdown by handling change events instead of intercepting its click.

- v42 button theme: default buttons retain the existing theme; Add/+ actions are light blue; Save actions are subtle green; Delete/Remove/X actions are subtle red.
