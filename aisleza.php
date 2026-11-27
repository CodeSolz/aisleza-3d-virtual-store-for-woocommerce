<?php
/**
 * Plugin Name:          Aisleza — 3D Virtual Store for WooCommerce
 * Plugin URI:           https://aisleza.com/
 * Description:          Turn your online shop into a place to explore. Customers walk 3D aisles built from your categories, pick products off the shelves into a real trolley and pay at your normal WooCommerce checkout.
 * Version:              1.1.4
 * Requires at least:    6.5
 * Requires PHP:         7.4
 * Requires Plugins:     woocommerce
 * WC requires at least: 8.5
 * WC tested up to:      11.0
 * Author:               CodeSolz
 * Author URI:           https://codesolz.net
 * License:              GPL v2 or later
 * License URI:          https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:          aisleza-3d-virtual-store-for-woocommerce
 * Domain Path:          /languages
 *
 * @package Aisleza
 */

defined( 'ABSPATH' ) || exit;

define( 'AISLEZA_VERSION', '1.1.4' );
define( 'AISLEZA_FILE', __FILE__ );
define( 'AISLEZA_DIR', plugin_dir_path( __FILE__ ) );
define( 'AISLEZA_URL', plugin_dir_url( __FILE__ ) );
define( 'AISLEZA_MIN_PHP', '7.4' );
define( 'AISLEZA_MIN_WC', '8.5' );
define( 'AISLEZA_ENGINE_API', 1 ); // Version of the add-on contract (docs/INTEGRATION-CONTRACT.md).

// PHP guard runs before any namespaced file is loaded.
if ( version_compare( PHP_VERSION, AISLEZA_MIN_PHP, '<' ) ) {
	add_action(
		'admin_notices',
		static function () {
			// Only on the Plugins screen and the Dashboard, to people who can fix it.
			$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
			if ( ! current_user_can( 'activate_plugins' ) || ! $screen || ! in_array( $screen->id, array( 'plugins', 'plugins-network', 'dashboard' ), true ) ) {
				return;
			}
			printf(
				'<div class="notice notice-error"><p>%s</p></div>',
				esc_html(
					sprintf(
						/* translators: 1: required PHP version, 2: current PHP version */
						__( 'Aisleza requires PHP %1$s or higher. Your site is running PHP %2$s.', 'aisleza-3d-virtual-store-for-woocommerce' ),
						AISLEZA_MIN_PHP,
						PHP_VERSION
					)
				)
			);
		}
	);
	return;
}

spl_autoload_register(
	static function ( $class_name ) {
		$prefix = 'Aisleza\\';
		if ( 0 !== strpos( $class_name, $prefix ) ) {
			return;
		}
		$file = AISLEZA_DIR . 'includes/' . str_replace( '\\', '/', substr( $class_name, strlen( $prefix ) ) ) . '.php';
		if ( is_readable( $file ) ) {
			require_once $file;
		}
	}
);

// Declare compatibility with WooCommerce order storage (HPOS) and the Cart/Checkout blocks.
add_action(
	'before_woocommerce_init',
	static function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', AISLEZA_FILE, true );
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', AISLEZA_FILE, true );
		}
	}
);

// Translations: WordPress loads wordpress.org language packs for the "aisleza" text domain by
// itself (WP 4.6+), so the plugin loads no text domain of its own (wp.org reviewers flag that).

// Late on plugins_loaded, so optional integrations (WearGraph boots at 10) are visible.
add_action( 'plugins_loaded', array( \Aisleza\Plugin::class, 'boot' ), 20 );
