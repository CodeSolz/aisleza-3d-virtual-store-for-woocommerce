=== Aisleza — 3D Virtual Store for WooCommerce ===
Contributors: codesolz, m.tuhin
Tags: woocommerce, 3d, virtual store, virtual shop, shopping
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
Requires Plugins: woocommerce
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Turn your WooCommerce shop into a 3D store shoppers walk through: aisles from your categories, a trolley that is the real cart, your normal checkout.

== Description ==

**Turn your online shop into a place to explore.**

Aisleza builds a walk-in 3D store from your WooCommerce catalog. Each product category you choose becomes an aisle with a hanging sign. Your products stand on the shelves with their catalog images and price tags. Shoppers push a trolley down the aisles, pick products off the shelves, and pay at your normal WooCommerce checkout.

The trolley is your real WooCommerce cart the whole time. Prices, taxes, discounts, stock and checkout all stay WooCommerce's own: Aisleza adds a new way to browse, not a new way to sell.

### The store

* A warm boutique interior: oak shelving with lit shelves, a slatted oak ceiling, living plant walls and potted olive trees.
* **Aisles from your categories.** Tick the categories you want, put them in order, and give each a sign label and a sign colour. Sub-categories become filters inside their aisle.
* **Real shelves.** Each product appears as several facings with its catalog image, with a price tag on the shelf edge (sale prices included). Free shelf space is styled with decor, so a small catalog still looks good.
* **A real trolley.** A wire trolley in front of the shopper shows the items in the cart. A drawer offers quantity, remove, subtotal and checkout.
* **Checkout lanes** by the exit lead to your WooCommerce checkout.
* Your store name is on the entrance and engraved on the trolley handle.

### Walking around

* Keyboard: W A S D or the arrow keys (Shift to hurry). Enter opens the product in front of you.
* Mouse: drag to look around, click a product to open it, click the floor or the store map to walk there.
* Phones and tablets: an on-screen joystick.
* Aisle buttons and the store map walk you to any aisle.

### Buying

* The product panel shows the gallery, price (including sale prices and price ranges), stock, short description and quantity.
* **Variable products:** choose the options; combinations that don't exist are greyed out, and the exact variation goes into the cart.
* Grouped, external and other special product types link to their product page.

### For every shopper

* **Shelf wall view:** a lighter, flat view of one aisle at a time, for older devices. Browsers without 3D support always get it.
* **List view** shows the products as a plain list, and keyboard users can reach the current aisle's product list straight after the 3D view.
* A **Regular shop** link is always one click away.

### Optional: WearGraph virtual try-on

If the WearGraph virtual try-on plugin is installed and set up, a "Try on me" button appears on the products WearGraph supports and opens WearGraph's own fitting room. Aisleza works fully without it: when WearGraph is missing or not set up, shoppers see no try-on buttons, and the settings page tells you what is needed.

== Installation ==

1. Install and activate WooCommerce, then install and activate Aisleza (Plugins → Add New).
2. Go to **Aisleza** in the admin menu (just below WooCommerce).
3. **Store page:** click *Create virtual store page* (it starts as a draft), or choose an existing page with the `[aisleza]` shortcode.
4. **Aisles:** tick the categories that become aisles and number them in order.
5. **Store:** set the store name, the brand accent, the layout (full window or inside your theme) and the view (walk-in 3D or shelf wall).
6. Preview the store while logged in, publish the page, and tick *Open the virtual store to shoppers*.

Menus are never changed for you. Link to the store page yourself, place the `[aisleza_link]` shortcode anywhere, or turn on the optional "Enter the virtual store" banner above the shop grid.

== Frequently Asked Questions ==

= Does it replace my shop or checkout? =

No. Your shop, product pages, cart and checkout stay exactly as they are. The virtual store is an extra page, and its trolley is the same WooCommerce cart.

= Does it work with my theme? =

Yes. Choose *Full window* (the store page shows only the store, with a link back to your shop) or *Inside my theme* (the store sits in your page content with your header and footer).

= Does it slow down my shop? =

The store's scripts load only on the store page. About 40 KB (compressed) loads with the page; the 3D engine (about 170 KB compressed) loads only when the shopper walks in. Nothing animates while the shopper stands still, and only the aisles near the shopper are loaded.

= Which product types are supported? =

Simple and variable products can be added to the cart in the store, with stock limits, backorders and "sold individually" respected. Grouped, external and other special product types show a button that opens their product page.

= Does it work on phones? =

Yes. Phones get an on-screen joystick, and the 3D view is lighter on phones. Shoppers can switch to the shelf wall or list view at any time.

= Does it store personal data or use cookies? =

Aisleza stores no personal data and sets no cookies of its own. The browser keeps a few display preferences (for example the last aisle, and where the shopper left the trolley so a refresh returns them there) in session storage, which is cleared when the tab closes. The cart is WooCommerce's own cart session.

= Does it contact any external service? =

No. Everything runs on your own site, and the 3D engine is included in the plugin. Product data comes from your own WooCommerce store.

= Can I cache the store page? =

Yes. The store page holds no cart data and no security tokens, so full-page caching is safe.

= What is removed when I delete the plugin? =

Aisleza's settings. Your store page is your content and stays; delete it yourself if you no longer need it.

== Screenshots ==

1. Walking into the store: aisles from your categories, with hanging signs.
2. Inside an aisle: products on lit oak shelves, with price tags.
3. The product panel, with options, quantity and Add to trolley.
4. The trolley drawer, with the cart and the way to checkout.
5. On a phone, with the on-screen joystick.
6. The settings page: store page, aisles and store options.

== Source code and build ==

The 3D engine `assets/js/world.js` is built from the readable source included in the plugin:

* `src/world/` – the engine (store building, shelves, trolley, textures, skins, styles and the hooks add-ons use).
* `skins/boutique/skin.json` – the store's look (colours, materials, lighting), as data.

It bundles [three.js](https://threejs.org/) 0.187.0 (MIT license). To rebuild: `npm install`, then `npm run build` (esbuild).

== Changelog ==

= 1.0.0 =
* First release: walk-in 3D store from your WooCommerce categories, trolley as the real cart, product panel with variations, checkout lanes, shelf wall and list views, optional WearGraph try-on.

== Upgrade Notice ==

= 1.0.0 =
First release.
