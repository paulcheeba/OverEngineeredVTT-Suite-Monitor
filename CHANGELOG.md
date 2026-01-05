# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to Semantic Versioning adapted for Foundry VTT modules: v{foundry version}.{major version}.{subversion}.{test subversion}.

## [13.1.0.0] - 2026-01-04

### Fixed
- **Version comparison now supports 5-part semantic versioning** (major.minor.patch.build.hotfix)
- Out-of-date modules now correctly categorize into "Out of Date" section instead of "Up to Date"
- Suppressed testingMode setting errors in production environments
- Removed ApplicationV1 deprecation warning by migrating to ApplicationV2
- Commented out dev-config import to prevent 404 errors in production

### Changed
- **Dialog now shows on every world load if modules are out-of-date** (unless hidden or snoozed)
- GitHub API fetch interval cached - only fetches fresh data every 12 hours
- Module status results cached between loads for immediate dialog display
- "Remind Me Later" button simplified - now just closes dialog, will reappear on next load
- Removed snooze timer functionality (no longer needed with new load behavior)
- Update check interval setting moved to dev-config only (prevents accidental GitHub API spam)
- Hidden state now exposed as user-facing setting "Dialog hidden until next OEV update" with checkbox in Module Settings
- testingMode setting check now gracefully handles missing setting registration

### Added
- Console logs showing dialog hidden state and time until next GitHub fetch
- New `lastCheckResults` setting to cache module status data between world loads

## [13.0.1.0] - 2026-01-03

### Added
- **First iteration complete** - Full-featured suite monitoring module for tracking OverEngineeredVTT modules
- DialogV2-based update notification dialog with modern, responsive design
- Automatic update checking via GitHub API (release tags)
- GM-only behavior - only GMs see notifications and dialogs
- Testing Mode setting for UI development and testing
- Three-section layout: Out of Date, Up to Date, and Available modules
- Color-coded module status (enabled/disabled) with visual indicators
- Condensed card layout with inline version display
- Banner section with Patreon and Discord buttons featuring hover glow effects
- Colored borders for each section (red for outdated, green for updated, gray for available)
- Scrollable content area with fixed 430px height
- "Hide Until Update" and "Remind Me Later" (2-hour snooze) functionality
- Fingerprint-based change detection to reset hidden state on new updates
- Configurable check interval (default 12 hours) with jitter
- Supports all 4 OEV modules: About Time Next, Chat Pruner, Find and Replace, Window Controls Next
- Separated concerns: Handlebars templates, CSS styling, and JavaScript logic
- Semantic HTML structure with proper section/header elements
- Foundry VTT v13+ compatible (ApplicationV2/DialogV2 APIs only)
- Version comparison with semver support including prerelease tags
- Proper error handling and network timeout protection (10s)

