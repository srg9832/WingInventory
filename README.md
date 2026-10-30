# Montana Wing Inventory · MT-001

One-screen checklist for **152 MT-001 communications inventory items**. Original workbook checked-off entries are carried over: **78 found / 74 still to locate** at initial import.

## Open the website

Expected URL (after GitHub Pages is enabled): https://srg9832.github.io/WingInventory/

**First-time setup:** On GitHub, open **Settings → Pages → Build and deployment → Source: GitHub Actions**. Run the **Deploy Wing Inventory** workflow from **Actions** if a deployment hasn't started automatically.

## Using the checklist

1. Sign in with your existing **CAP Applications** email and password.
2. By default, only equipment still to find is displayed. Search by property tag, noun, make, model, location, or assignee, or use the drop-down filters.
3. Tap an unchecked square after physically verifying the asset. The checkmark saves to the shared database. Tap again to undo a mistaken check.
4. Use **All / To find / Found** views and **Export CSV** for a spreadsheet snapshot.
5. An existing CAP Applications application administrator may use **Manage access** to add another *existing login email* to the inventory access list. Users share progress across devices.

## Data and security

The repository contains the web application **only**. It does not contain the inventory table, personnel assignments, or administrator passwords. The data lives in the existing **CAP Applications** Supabase project in two isolated tables: `wing_inventory_items` and `wing_inventory_invites`.

Row Level Security (RLS) allows authorized application administrators and invited email accounts to view the inventory and change checkmarks. Visitors who are not signed in cannot read the inventory. The Supabase publishable key in `app.js` is intended to be public; **never** put a service-role key in this repository.

Checkmarks are saved immediately with a timestamp and user ID for new changes; initial spreadsheet checks do not have a verification timestamp, and are labeled “From spreadsheet.” The screen refreshes automatically approximately every 45 seconds and whenever the browser tab returns to focus.

## Maintenance

- Static HTML / CSS / JS; GitHub Pages hosting, no build step.
- `app.js`: view logic, login, filters, and Supabase integration.
- `styles.css`: desktop/tablet/mobile styles.
- `.github/workflows/pages.yml`: GitHub Pages deployment.
- Original source: `MT-001_Communications_Inventory(1).xlsx` (not stored in the public repository).
