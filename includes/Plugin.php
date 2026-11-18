<?php
/**
 * Boot: WooCommerce check, then the separate modules.
 *
 * @package Aisleza
 */

namespace Aisleza;

defined( 'ABSPATH' ) || exit;

use Aisleza\Admin\SettingsPage;
use Aisleza\Catalog\Sections;
use Aisleza\Frontend\EntryLink;
use Aisleza\Frontend\PageTemplate;
use Aisleza\Frontend\Shortcode;
use Aisleza\Integrations\Registry;
use Aisleza\Rest\ProductContextController;

/**
 * Modules: frontend (shortcode, page template, entry links), commerce data (REST context; the
 * cart itself is WooCommerce's Store API), optional integrations and admin settings.
 */
final class Plugin {

	/**
	 * Built services by id.
	 *
	 * @var array<string,object>
	 */
	private static $services = array();

	/**
	 * Hooked to plugins_loaded (20, so optional integrations have booted first).
	 */
	public static function boot(): void {
		if ( self::$services ) {
			return;
		}

		$problems = Requirements::problems();
		if ( $problems ) {
			Requirements::notice( $problems );
			self::inert();
			return;
		}

		$integrations = new Registry();
		$sections     = Sections::from_wordpress();
		$shortcode    = new Shortcode( $sections, $integrations );

		self::$services = array(
			'integrations' => $integrations,
			'sections'     => $sections,
			'shortcode'    => $shortcode,
		);

		$shortcode->boot();
		( new EntryLink() )->boot();
		( new PageTemplate() )->boot();

		add_action(
			'rest_api_init',
			static function () use ( $integrations ) {
				( new ProductContextController( $integrations ) )->register_routes();
			}
		);

		if ( is_admin() ) {
			self::$services['settings_page'] = new SettingsPage( $sections, $integrations );
			self::$services['settings_page']->boot();
		}

		/**
		 * Fires once the virtual store's modules are booted.
		 */
		do_action( 'aisleza_loaded' );
	}

	/**
	 * A built service, or null.
	 *
	 * @param string $id Service id.
	 * @return object|null
	 */
	public static function service( string $id ) {
		return self::$services[ $id ] ?? null;
	}

	/**
	 * WooCommerce missing: keep the shortcodes from printing as raw text on the store page.
	 */
	private static function inert(): void {
		add_action(
			'init',
			static function () {
				$closed = static function () {
					$shop = function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'shop' ) : home_url( '/' );

					return sprintf(
						'<div class="aisleza-closed"><p>%1$s</p><p><a href="%2$s">%3$s</a></p></div>',
						esc_html__( 'Our virtual store is closed right now.', 'aisleza-3d-virtual-store-for-woocommerce' ),
						esc_url( $shop ),
						esc_html__( 'Visit the shop', 'aisleza-3d-virtual-store-for-woocommerce' )
					);
				};
				if ( ! shortcode_exists( Shortcode::TAG ) ) {
					add_shortcode( Shortcode::TAG, $closed );
				}
				if ( ! shortcode_exists( EntryLink::TAG ) ) {
					add_shortcode( EntryLink::TAG, '__return_empty_string' );
				}
			}
		);
	}
}
