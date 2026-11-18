<?php
/**
 * Product naming in one place, so the provisional name can change without a code hunt.
 *
 * @package Aisleza
 */

namespace Aisleza;

defined( 'ABSPATH' ) || exit;

/**
 * Brand: Aisleza. The platform-specific title ("… for WooCommerce") is kept separate from the
 * brand so later platforms (Shopify and others) reuse the brand and tagline.
 */
final class Brand {

	/**
	 * Full product title (plugin name).
	 */
	public static function name(): string {
		/**
		 * Product title.
		 *
		 * @param string $name Title.
		 */
		return (string) apply_filters( 'aisleza_brand_name', __( 'Aisleza — 3D Virtual Store for WooCommerce', 'aisleza-3d-virtual-store-for-woocommerce' ) );
	}

	/**
	 * The brand on its own, for menus and notices.
	 */
	public static function short_name(): string {
		/**
		 * The brand on its own (the admin menu). An add-on may white-label it.
		 *
		 * @param string $name Brand name.
		 */
		return (string) apply_filters( 'aisleza_brand_short_name', 'Aisleza' ); // A brand name; not translated.
	}

	/**
	 * Whether the admin shows the Aisleza mark (menu icon and settings page). Off when an add-on
	 * white-labels the plugin: the menu then uses a plain store icon.
	 */
	public static function mark(): bool {
		/**
		 * Show the Aisleza mark.
		 *
		 * @param bool $show Show it.
		 */
		return (bool) apply_filters( 'aisleza_brand_mark', true );
	}

	/**
	 * Tagline used on the settings page.
	 */
	public static function tagline(): string {
		/**
		 * Tagline on the settings page.
		 *
		 * @param string $tagline Tagline.
		 */
		return (string) apply_filters( 'aisleza_brand_tagline', __( 'Turn your online shop into a place to explore.', 'aisleza-3d-virtual-store-for-woocommerce' ) );
	}
}
