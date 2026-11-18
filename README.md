# Aisleza — 3D Virtual Store for WooCommerce

> Turn your online shop into a place to explore.

Aisleza is the brand; "for WooCommerce" names the platform, so later versions for other platforms (Shopify and others) share the brand and tagline. Names are set in `includes/Brand.php`. Internal identifiers: slug and text domain `aisleza`, PHP namespace `Aisleza`, prefix `aisleza_`, REST `aisleza/v1`, CSS `.aisleza`.

Shoppers walk into a 3D store built from your product categories: groceries, electronics, beauty, homeware, toys, fashion or a mix. They push a trolley down the aisles, pick products off the shelves and pay at your normal WooCommerce checkout. The trolley is the real WooCommerce cart the whole time.

## Requirements

| | Minimum (declared) | Tested with |
|---|---|---|
| WordPress | 6.5 | 7.1.4 |
| WooCommerce | 8.5 | 11.0.1, block cart and checkout |
| PHP | 7.4 | 7.4.3 (clean install), 8.1.4, 8.2.12 |
| Browser | Current Chrome, Edge, Firefox or Safari; WebGL for the 3D view | Chrome, desktop and phone emulation |

WooCommerce is the only required plugin. If it is missing or too old, the store shows an admin notice and stays off; store pages show a short "closed" message with a link to the shop.

Only the "Tested with" column has been exercised. The minimums come from the APIs the code uses (Store API cart and products routes, `Requires Plugins`) and from WooCommerce's own minimums. WooCommerce versions between 8.5 and 11.0 have not been tested.

## Install

1. Plugins → Add New → Upload Plugin → `aisleza.zip` → Install → Activate.
2. Go to **WooCommerce → Aisleza**.

## Setup (WooCommerce → Aisleza)

The page shows five steps and ticks each one off as it is done.

1. **Store page.** Click *Create virtual store page* to make a draft page containing `[aisleza]`, or select an existing page. Nothing is published for you.
2. **Aisles.** Tick the categories that become aisles and number them in order. You can give each a sign label, a sign colour and the category image. Sub-categories become filters inside their aisle. A product in two ticked categories appears on both aisles and is still one product.
3. **Store.** Store name (it is also engraved on the trolley handle), brand accent, layout (*full window* or *inside my theme*) and view (*walk-in 3D* or the lighter *shelf wall*).
4. **Preview, then open.** Preview while logged in, publish the page, and switch on *Open the virtual store to shoppers*.
5. **Integrations (optional).** See below.

Menus are never changed. Link to the store page yourself, place `[aisleza_link]` anywhere, or switch on the optional banner above the shop grid.

## What shoppers can do

- **Walk:** W A S D or the arrow keys (Shift to hurry), drag to look around, or click the floor or the minimap. On phones there is an on-screen joystick. Aisle buttons and the store map auto-walk to an aisle.
- **Shelves:** each product appears as several facings showing its catalog image, with a price tag on the shelf edge. Products without an image get a placeholder.
- **Product panel:** gallery, price (including sale and price ranges), stock, short description, quantity, and variation choices with impossible combinations greyed out.
- **Trolley:** a steel wire trolley pushed in front of the shopper. It holds the real cart lines as product cards, and a drawer offers quantity, remove, subtotal and checkout.
- **Checkout counter:** lanes by the exit. Walking there, or pressing *Checkout* at any time, goes to your WooCommerce checkout.
- **Without spatial movement:** keyboard users reach a list of the current aisle's products straight after the 3D view. *List view* shows everything as a plain list, and *Regular shop* is always one click away.

## Supported product types

| Type | In the store |
|---|---|
| Simple | Full support: add with quantity; stock limits, backorders and sold-individually honoured |
| Variable | Full support: choose attributes (including "any" attributes); the exact variation is added |
| Grouped, external, subscriptions, bundles, bookings and other extension types | *View product* or *Configure product*, which leads to the product page. No generic add button. |

Totals, taxes, discounts, stock and availability always come from WooCommerce. Nothing is reserved until the order is placed.

## Optional integration: WearGraph — AI Virtual Try-On

*Let shoppers preview supported wearable products on their own photos. Optional: your virtual store works fully without WearGraph.*

| WearGraph | Store behaviour |
|---|---|
| Not installed or inactive | Normal shopping. Shoppers see no try-on and no warnings; the settings page shows the status. |
| Installed but outdated, not running or not configured | Normal shopping. The settings page explains what to fix. |
| Ready | *Try on me* appears only on products WearGraph marks as ready, opening WearGraph's own fitting room. |
| Switched off while a shopper is in the store | The store checks again before opening the fitting room and shows "Try-on is not available right now". The cart and browsing position stay as they were. |

Photos, consent, AI providers, limits, charges and generation jobs all stay inside WearGraph. Opening a product never starts a generation. Details: `docs/INTEGRATION-CONTRACT.md`.

## Privacy and performance

- No personal data is stored. The browser keeps only UI preferences (entered, last aisle, list view) in `sessionStorage`; the cart lives in WooCommerce's session.
- Store pages contain no nonce or cart data, so full-page caches are safe. Cart and add-on REST responses are `no-store`.
- Scripts load only where the store renders. The page loads about 30 KB gzip up front; the 3D engine (three.js, about 135 KB gzip) loads after the shopper enters. Nothing animates or renders while the shopper is idle.

## Development

```
npm install && npm run build                 # src/world → assets/js/world.js (three.js 0.187, esbuild)
php tests/php/run.php                        # unit tests, no WordPress
node --test tests/js/*.test.js               # cart store, variations, money, try-on bridge
wp eval-file tests/integration/StoreIntegration.php
node tests/e2e/<suite>.js                    # browser checks (see tests/e2e/lib.js for setup)
php bin/build.php --zip                      # build/aisleza-3d-virtual-store-for-woocommerce.zip
```

Fixtures for development sites only: `tests/fixtures.php` (edge-case products), `tests/fixtures-large.php` (big aisle), and `tests/fixtures-mixed.php` (mixed retail catalog with EUR, tax, shipping and COD, for a throwaway site). Never run them on a live store.

## Releasing

`.github/workflows/release.yml` publishes a version to WordPress.org (SVN trunk + `tags/<version>`) and mirrors it to [CodeSolz/aisleza-3d-virtual-store-for-woocommerce](https://github.com/CodeSolz/aisleza-3d-virtual-store-for-woocommerce) with a GitHub release. The banners, icons and screenshots in `.wordpress-org/` go to the SVN `assets/` folder on every run.

1. Bump the version in `aisleza.php` (header + `AISLEZA_VERSION`) and `readme.txt` (`Stable tag` + a changelog entry).
2. `bash git-push.sh --mdev "dev commit message" --mprod "public commit message" --release 1.0.1`

Or run the workflow by hand (Actions → Release → Run workflow): it releases the version in `aisleza.php`. Before publishing it runs PHP 7.4 lint, phpcs, the PHP and JS tests, a screenshots-vs-captions check, Plugin Check, and a smoke test on WordPress + WooCommerce. A code change under an already-published version is refused; a readme-only change may reuse it.

Repository secrets: `WP_SVN_USERNAME`, `WP_SVN_PASSWORD` (the SVN password from the wordpress.org profile, not the login password) and `PROD_PUSH_TOKEN` (push access to the CodeSolz repo; without it only the mirror is skipped).
