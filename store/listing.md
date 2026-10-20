# Chrome Web Store listing

Everything the developer dashboard asks for, ready to paste. Upload `dist/maps-lead-scraper-<version>.zip` (`npm run package`).

## Store listing tab

**Name** (from the manifest): Maps Lead Scraper

**Summary** (from the manifest, max 132 chars):
Sweep an area on Google Maps and collect business names, phones, websites, ratings and addresses. Export to CSV.

**Category:** Productivity → Tools

**Language:** English

**Description:**

```
Turn any Google Maps search into a clean lead list.

Search for anything on Google Maps (dentists, coffee shops, hair salons…), open the side panel and press Start. Maps Lead Scraper collects every business it sees and keeps a live count of phones, websites and social profiles.

AREA SWEEP — HANDS-FREE
Area sweep moves the map by itself in a spiral (3×3, 5×5 or 7×7 spots) and empties the results list at every spot, so you cover a whole neighbourhood without dragging the map yourself.

THREE MODES
• Area sweep: the map moves by itself and every spot is collected.
• This list: scrolls the current results list to the end, then stops.
• Manual: only records what you browse.

WHAT YOU GET FOR EACH BUSINESS
Name, category, phone (local and international), website, social profile, rating, review count, full address (street, neighbourhood, city, postal code, country), coordinates, opening hours, Google place ID and a Google Maps link.

FILTER AND EXPORT
Filter by Website, No website, Phone or Socials and export to CSV in one click. Businesses without a website are often the best leads.

PRIVATE BY DESIGN
• Runs only on Google Maps pages and never visits other websites.
• No account, no server, no analytics: results stay in your browser until you export them.
• Free and open source (MIT): https://github.com/falconsw/maps-lead-scraper

Not affiliated with or endorsed by Google. Google Maps is a trademark of Google LLC. You are responsible for using exported data in line with the Google Maps Terms of Service and the data protection and marketing laws that apply to you.
```

**Graphic assets**

| Field | File |
| --- | --- |
| Store icon (128×128) | `extension/icons/icon128.png` |
| Screenshots (1280×800) | `store/screenshots/1-area-sweep.png`, `2-every-business.png`, `3-no-website-leads.png`, `4-private-open-source.png` |
| Small promo tile (440×280) | `store/promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `store/marquee-1400x560.png` |
| Promo video | YouTube link to `store/build/promo.mp4` (build with `scripts/promo/`) |

**Official URL / Homepage:** https://github.com/falconsw/maps-lead-scraper
**Support URL:** https://github.com/falconsw/maps-lead-scraper/issues

## Privacy practices tab

**Single purpose:**
Collect business listings from the Google Maps search results the user opens into an exportable list.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `sidePanel` | Shows the capture controls, live counts, history and export next to Google Maps. |
| `storage` | Remembers the capture mode, sweep size and the session being captured. |
| `unlimitedStorage` | Captured businesses are kept locally in IndexedDB; large area sweeps can exceed the default quota. |
| Host permissions (`https://www.google.<country>/maps*`) | Reads the search results Google Maps loads on these pages, scrolls the results list and moves the map during an area sweep. The extension runs on no other sites. |

**Remote code:** No, I am not using remote code. All JavaScript is packaged with the extension.

**Data usage:** The extension does not collect or transmit user data. Leave every data type unchecked and tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/falconsw/maps-lead-scraper/blob/main/PRIVACY.md

## Distribution tab

Visibility: Public · Regions: All regions · Pricing: Free
