# Privacy Policy — Maps Lead Scraper

_Last updated: 21 October 2026_

Maps Lead Scraper is a Chrome extension that collects business listings from Google Maps search results you open in your own browser.

## What the extension handles

- **Business listings shown by Google Maps**: name, category, phone, website, rating, review count, address, coordinates, opening hours and Google place identifiers.
- **Extension settings**: the capture mode, sweep size and the current session.

## Where the data goes

- Everything is stored **locally in your browser** (IndexedDB and `chrome.storage`).
- The extension has **no server, no account, no analytics and no tracking**. It does not send any data to the developer or to third parties.
- Data leaves your browser only when you export it yourself as a CSV file.

## What the extension accesses

- It runs **only on Google Maps pages** (`https://www.google.<country>/maps*`). It reads the search results that Google Maps loads, scrolls the results list and moves the map while a capture is running.
- It never visits business websites or any other site, and it does not read your browsing history, cookies, passwords or personal Google account data.

## Deleting your data

Delete a session from the **History** tab, or remove the extension to delete everything it stored.

## Your responsibility

The listings are public business information published on Google Maps. You are responsible for how you use exported data, including compliance with the Google Maps Terms of Service and data protection and marketing laws that apply to you (for example GDPR or KVKK).

## Contact

Open an issue at https://github.com/falconsw/maps-lead-scraper/issues.
