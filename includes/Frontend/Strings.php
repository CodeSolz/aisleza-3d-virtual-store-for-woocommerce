<?php
/**
 * Translatable storefront strings for the store script.
 *
 * @package Aisleza
 */

namespace Aisleza\Frontend;

defined( 'ABSPATH' ) || exit;

/**
 * Placeholders: %s and %d, or %1$s-style when there are several (store.js fmt() fills both).
 */
final class Strings {

	/**
	 * All strings, keyed as store.js reads them (t.key). helpKeys and helpTouch are lists.
	 *
	 * @return array<string,string|string[]>
	 */
	public static function all(): array {
		return array(
			/* Entrance */
			'entranceLead'         => __( 'Walk the aisles, pick what you like and pay at our normal checkout.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'enter'                => __( 'Enter store', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'takeTrolleyLead'      => __( 'Grab a trolley — it follows you round the store.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'takeTrolley'          => __( 'Take a trolley', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'takeYourTrolley'      => __( 'Take your trolley', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: like "3 items", already in the cart */
			'welcomeBack'          => __( 'Welcome back! Your trolley still holds %s.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'duplicate'            => __( 'The virtual store is already open further up this page.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'previewNote'          => __( 'Preview: the virtual store is switched off for shoppers.', 'aisleza-3d-virtual-store-for-woocommerce' ),

			/* Navigation */
			'searchLabel'          => __( 'Search the store', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'searchPlaceholder'    => __( 'Search products', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'storeMap'             => __( 'Store map', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'listView'             => __( 'List view', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'listOn'               => __( 'List view on: products show as a simple list.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'listOff'              => __( 'List view off: products show on shelves.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'regularShop'          => __( 'Regular shop', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'storeTools'           => __( 'Store tools', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'aislesMenu'           => __( 'Aisles', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'fillWindow'           => __( 'Fill the window', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'exitFillWindow'       => __( 'Back to the page', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'fullScreen'           => __( 'Full screen', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'exitFullScreen'       => __( 'Exit full screen', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'sectionsNav'          => __( 'Store sections', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'checkoutCounter'      => __( 'Checkout counter', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: section name */
			'nowIn'                => __( 'Now in %s.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: search words */
			'searchResults'        => __( 'Search: “%s”', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'filters'              => __( 'Filter this aisle', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'allInSection'         => __( 'All', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'noSections'           => __( 'This store has no aisles yet.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %d: number of products */
			'productCount'         => __( '%d products', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'productCountOne'      => __( '1 product', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'payHere'              => __( 'Pay for your trolley', 'aisleza-3d-virtual-store-for-woocommerce' ),

			/* Shelves */
			'prevShelf'            => __( 'Previous shelf', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'nextShelf'            => __( 'Next shelf', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: 1: shelf number, 2: number of shelves */
			'shelfCount'           => __( 'Shelf %1$d of %2$d', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: 1: section name, 2: shelf number, 3: number of shelves */
			'shelfOf'              => __( '%1$s, shelf %2$d of %3$d', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'loadingShelf'         => __( 'Loading the shelf…', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'shelfFailed'          => __( 'This shelf could not be loaded. Check your connection and try again.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'emptyShelf'           => __( 'This aisle is empty right now.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: search words */
			'noResults'            => __( 'Nothing found for “%s”. Try other words or pick an aisle.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: 1: number of products found, 2: search words */
			'resultsCount'         => __( '%1$d products found for “%2$s”.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'retry'                => __( 'Try again', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'sale'                 => __( 'Sale', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'outOfStock'           => __( 'Out of stock', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'inStock'              => __( 'In stock', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'tryOnBadge'           => __( 'Try on', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'newBadge'             => __( 'New', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %d: how many are left in stock */
			'onlyLeft'             => __( 'Only %d left', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'was'                  => __( 'Was', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'now'                  => __( 'now', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'seeProduct'           => __( 'See product', 'aisleza-3d-virtual-store-for-woocommerce' ),

			/* Product panel */
			'close'                => __( 'Close', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'gallery'              => __( 'Product images', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: 1: image number, 2: number of images */
			'showImage'            => __( 'Show image %1$d of %2$d', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'noImage'              => __( 'No image available', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: attribute name, like Size */
			'chooseOption'         => __( 'Choose %s', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'unavailable'          => __( 'unavailable', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'chooseOptions'        => __( 'Choose your options to add this to your trolley.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'comboUnavailable'     => __( 'That combination is not available. Please choose different options.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'checking'             => __( 'Checking this option…', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'optionFailed'         => __( 'The details for this option could not be loaded.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'notPurchasable'       => __( 'This product cannot be bought online.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'configureOnPage'      => __( 'This product is set up on its own page.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'configureProduct'     => __( 'Configure product', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'viewProduct'          => __( 'View product', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'productPage'          => __( 'Open the full product page', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'shareProduct'         => __( 'Share this product', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'takeMeThere'          => __( 'Show me where it is', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'linkCopied'           => __( 'Link copied. It opens the 3D store at this product.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'saveProduct'          => __( 'Save for later', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'savedProduct'         => __( 'Saved', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'savedList'            => __( 'Saved products', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %d: number of saved products. */
			'savedCount'           => __( 'Saved products (%d)', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'savedEmpty'           => __( 'Nothing saved yet. Press the heart in a product window to keep it here for later.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'savedOn'              => __( 'Saved for later.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'savedOff'             => __( 'Removed from your saved products.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %d: the most products the list can hold. */
			'savedFull'            => __( 'Your list is full (%d products). Remove one to save another.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'shareSaved'           => __( 'Share my list', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'savedLinkCopied'      => __( 'Link copied. It opens the 3D store with these products.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'sharedList'           => __( 'A shared list', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'keepShared'           => __( 'Save these to my list', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'keptShared'           => __( 'Saved to your list.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'backToStore'          => __( 'Back to the store', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'quantity'             => __( 'Quantity', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'decrease'             => __( 'One fewer', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'increase'             => __( 'One more', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'soldIndividually'     => __( 'Limited to one per order.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'addToTrolley'         => __( 'Add to trolley', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'adding'               => __( 'Adding…', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: 1: quantity, 2: product name */
			'added'                => __( 'Added %1$d × %2$s to your trolley.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'notAdded'             => __( 'The connection dropped and the item was not added. Please try again.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'uncertain'            => __( 'We could not confirm whether the item was added. Please check your trolley before trying again.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'checkTrolley'         => __( 'Check my trolley', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'viewTrolley'          => __( 'View trolley', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'keepShopping'         => __( 'Keep shopping', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'network'              => __( 'Network problem. Please check your connection and try again.', 'aisleza-3d-virtual-store-for-woocommerce' ),

			/* Try-on */
			'tryOn'                => __( 'Try on me', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'tryOnNote'            => __( 'Opens our fitting room. It shows how this item could look on you; it cannot check size or fit.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'tryOnOpening'         => __( 'Opening the fitting room…', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'tryOnGone'            => __( 'Try-on is not available right now. You can keep shopping as normal.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'tryOnFailed'          => __( 'The fitting room could not open. You can keep shopping and try again later.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'optionNoTryOn'        => __( 'This option cannot be tried on yet. Choose another option, or add it to your trolley.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'newTryOnNeeded'       => __( 'You tried on a different option. Seeing this one needs a new try-on.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'selectionFromFitting' => __( 'Your choice now matches the option you last tried on.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'backFromFitting'      => __( 'Back in the store. Your trolley is unchanged unless you added something in the fitting room.', 'aisleza-3d-virtual-store-for-woocommerce' ),

			/* Trolley */
			'trolley'              => __( 'Trolley', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'yourTrolley'          => __( 'Your trolley', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'trolleySummary'       => __( 'Trolley summary', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: like "3 items" */
			'trolleyButton'        => __( 'Open trolley, %s', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %d: number of items */
			'items'                => __( '%d items', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'itemOne'              => __( '1 item', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: 1: average rating such as 4.5, 2: number of reviews */
			'ratedReviews'         => __( 'Rated %1$s out of 5 from %2$s reviews', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: average rating such as 4.5 */
			'ratedOneReview'       => __( 'Rated %s out of 5 from 1 review', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %d: number of reviews */
			'reviewsCount'         => __( '(%d reviews)', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'reviewOne'            => __( '(1 review)', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: amount */
			'subtotalShort'        => __( 'Subtotal %s', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'subtotal'             => __( 'Subtotal', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'discount'             => __( 'Discount', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'shippingTaxLater'     => __( 'Shipping and taxes are calculated at checkout.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'shippingLater'        => __( 'Includes tax. Shipping is calculated at checkout.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: amount still needed */
			'freeShippingLeft'     => __( 'Add %s more for free shipping', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'freeShippingReached'  => __( 'Your order qualifies for free shipping', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'alsoLike'             => __( 'You may also like', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: 1: product name, 2: price */
			'alsoLikeGo'           => __( '%1$s, %2$s. Show me where it is', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'loadingTrolley'       => __( 'Fetching your trolley…', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'trolleyUnavailable'   => __( 'Your trolley could not be loaded right now.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'emptyTrolley'         => __( 'Your trolley is empty. Pick an aisle to start shopping.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'checkout'             => __( 'Checkout', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'viewCart'             => __( 'View cart', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'remove'               => __( 'Remove', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: product name */
			'removeItem'           => __( 'Remove %s from the trolley', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: product name */
			'decreaseItem'         => __( 'One fewer %s', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: product name */
			'increaseItem'         => __( 'One more %s', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: product name */
			'quantityOf'           => __( 'Quantity of %s', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %d: quantity */
			'qtyFixed'             => __( 'Qty %d', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: 1: product name, 2: new quantity */
			'qtyUpdated'           => __( '%1$s: quantity is now %2$d.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: product name */
			'removed'              => __( '%s was removed from your trolley.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'savingTrolley'        => __( 'Saving your trolley, then on to checkout…', 'aisleza-3d-virtual-store-for-woocommerce' ),

			/* Walk-in 3D store */
			'worldRole'            => __( 'Walk-in store', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'worldLabel'           => __( 'The store. Walk with the arrow keys or W, A, S, D, look around by dragging, and press Enter on the product in front of you. The products of this aisle are listed after it.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'helpKeys'             => array(
				__( 'Walk: W A S D or the arrow keys (hold Shift to hurry)', 'aisleza-3d-virtual-store-for-woocommerce' ),
				__( 'Look around: drag with the mouse', 'aisleza-3d-virtual-store-for-woocommerce' ),
				__( 'Products: click one, or face it and press Enter', 'aisleza-3d-virtual-store-for-woocommerce' ),
				__( 'Go straight to an aisle: the aisle buttons or the map', 'aisleza-3d-virtual-store-for-woocommerce' ),
			),
			'helpTouch'            => array(
				__( 'Walk: use the joystick', 'aisleza-3d-virtual-store-for-woocommerce' ),
				__( 'Look around: drag the view', 'aisleza-3d-virtual-store-for-woocommerce' ),
				__( 'Products: tap one', 'aisleza-3d-virtual-store-for-woocommerce' ),
				__( 'Go straight to an aisle: the aisle buttons or the map', 'aisleza-3d-virtual-store-for-woocommerce' ),
			),
			'gotIt'                => __( 'Got it', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'minimap'              => __( 'Store map: click to walk there', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'clickToView'          => __( 'Click to view', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'lobby'                => __( 'Store entrance', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: 1: aisle number, 2: section name */
			'aisleN'               => __( 'Aisle %1$d · %2$s', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'nothingAhead'         => __( 'Nothing in front of you. Walk up to a shelf, or use the product list after the store view.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'aisleProducts'        => __( 'Products near you', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'featuredProducts'     => __( 'Featured in the store', 'aisleza-3d-virtual-store-for-woocommerce' ),
			/* translators: %s: section name */
			'aisleProductsIn'      => __( 'Products in %s', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'noAisleProducts'      => __( 'Walk into an aisle to list its products here.', 'aisleza-3d-virtual-store-for-woocommerce' ),

			/* Checkout counter */
			'checkoutLamp'         => __( 'Checkout', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'counterEmpty'         => __( 'Nothing to pay for yet. Your trolley is empty.', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'backToAisles'         => __( 'Back to the aisles', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'payAtCheckout'        => __( 'Pay at checkout', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'reviewTrolley'        => __( 'Review trolley', 'aisleza-3d-virtual-store-for-woocommerce' ),
		);
	}
}
