=== Aisleza — 3D Virtual Store for WooCommerce ===
Contributors: codesolz, m.tuhin
Tags: virtual store, 3d store, woocommerce, virtual showroom, 3d
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
Requires Plugins: woocommerce
Stable tag: 1.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A 3D virtual store for WooCommerce: shoppers walk aisles made from your categories, pick products off shelves and pay at your normal checkout.

== Description ==

**Turn your online shop into a place to explore.**

Aisleza is a free 3D virtual store plugin for WooCommerce. It builds a walk-in 3D store, a virtual showroom shoppers can walk through, from your WooCommerce catalog. No 3D models are needed. Each product category you choose becomes an aisle with a hanging sign. Your products stand on the shelves with their catalog images and price tags. Shoppers push a trolley down the aisles, pick products off the shelves, and pay at your normal WooCommerce checkout.

The trolley is your real WooCommerce cart the whole time. Prices, taxes, discounts, stock and checkout all stay WooCommerce's own: Aisleza adds a new way to browse, not a new way to sell.

Everything below is free. Want more? **[Aisleza Pro](https://aisleza.com/pricing/)** adds eight more store interiors, Ava the shopping assistant, a golden box coupon hunt, seasonal makeovers, merchandising tools and shopper insights.

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

### Aisleza Pro (optional add-on)

The free plugin is the complete walk-in store. [Aisleza Pro](https://aisleza.com/pricing/) is a separate add-on for shops that want more:

* **Eight more interiors:** Noir, Fresh Market, Studio, Blush, Greenhouse, Library, Loft and Playroom, plus every new one.
* **Ava, the shopping assistant:** answers questions about your products and walks shoppers to the right shelf. AI conversations with your own Claude or OpenAI key on Business and Agency.
* **Branding:** your logo on the shop front and trolley, your sign colours and font.
* **Camera views:** classic, over the trolley, or walk freely.
* **Merchandising:** a promo table at the entrance, aisle-end displays, automatic aisles (new, on sale, bestsellers), wall posters and TV screens with your videos.
* **Golden box coupon hunt:** a glowing gift box hidden in an aisle; whoever finds it gets your coupon.
* **Seasons and ambience:** Christmas, Black Friday, Eid and Halloween makeovers; evening or night outside, rain or snow, background music.
* **3D products and mannequins:** real 3D models on the shelves and dressed mannequins by the clothing.
* **More stores:** a kids' store, an outlet or one store per brand on the same site.
* **Shopper insights:** visits, busiest aisles, products opened and added, checkout rate and a floor heatmap.
* **Business and Agency plans:** the store designer, your own pictures on floors and walls, and video adverts on the shelf ends. **Agency:** white-label for client sites.

Plans start at $99 a year, or pay once. [See Aisleza Pro plans and prices](https://aisleza.com/pricing/) · [Walk the live demo](https://aisleza.com/demo/)

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

== Changelog ==

= 1.1.0 =
* New: shopper events for add-ons (walked in, aisles, products opened, added to the trolley, went to checkout), so add-ons can count what shoppers do. Nothing leaves the page unless an add-on sends it.
* New: add-ons can show 3D models (.glb) on the shelves instead of the photo boxes.
* The store keeps working exactly as before when no add-on uses these.

= 1.0.0 =
* First release: walk-in 3D store from your WooCommerce categories, trolley as the real cart, product panel with variations, checkout lanes, shelf wall and list views, optional WearGraph try-on.

== Upgrade Notice ==

= 1.1.0 =
Shopper events and 3D model support for add-ons.

= 1.0.0 =
First release.
