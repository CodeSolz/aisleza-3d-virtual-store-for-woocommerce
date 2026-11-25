<?php
/**
 * Ways into the store that the merchant opts into. Navigation menus are never changed.
 *
 * @package Aisleza
 */

namespace Aisleza\Frontend;

defined( 'ABSPATH' ) || exit;

use Aisleza\Settings;

/**
 * [aisleza_link label="…"] anywhere, an optional banner above the shop grid ("Entry link: shop
 * banner") and an optional "See it in the 3D store" button on product pages. Both stay hidden until the store page is published and
 * the store is enabled.
 */
final class EntryLink {

	public const TAG = 'aisleza_link';

	/**
	 * Register hooks.
	 */
	public function boot(): void {
		add_shortcode( self::TAG, array( $this, 'shortcode' ) );
		if ( 'shop_banner' === Settings::get( 'entry_link' ) ) {
			add_action( 'woocommerce_before_shop_loop', array( $this, 'banner' ), 5 );
		}
		if ( Settings::get( 'product_link' ) ) {
			add_action( 'woocommerce_single_product_summary', array( $this, 'product_button' ), 35 );
		}
	}

	/**
	 * The store page at a product: the shopper walks to it and it opens (?aisleza_product=).
	 *
	 * @param int $product_id Product id.
	 */
	public static function product_url( int $product_id ): string {
		$url = self::store_url();

		return '' === $url || $product_id <= 0 ? '' : (string) add_query_arg( 'aisleza_product', $product_id, $url );
	}

	/**
	 * "See it in the 3D store" on a product page, below the add-to-cart button.
	 */
	public function product_button(): void {
		global $product;
		if ( ! $product instanceof \WC_Product || ! $product->is_visible() ) {
			return;
		}
		$url = self::product_url( (int) $product->get_id() );
		if ( '' === $url ) {
			return;
		}
		printf(
			'<p class="aisleza-product-link"><a class="button aisleza-product-link__btn" href="%1$s">%2$s</a></p>',
			esc_url( $url ),
			esc_html__( 'See it in the 3D store', 'aisleza-3d-virtual-store-for-woocommerce' )
		);
	}

	/**
	 * The published store page URL, or '' when shoppers cannot enter yet.
	 */
	public static function store_url(): string {
		$page_id = (int) Settings::get( 'page_id' );
		if ( ! Settings::get( 'enabled' ) || ! $page_id || 'publish' !== get_post_status( $page_id ) ) {
			return '';
		}

		return (string) get_permalink( $page_id );
	}

	/**
	 * Link shortcode.
	 *
	 * @param array<string,string>|string $atts Attributes.
	 */
	public function shortcode( $atts ): string {
		$atts = shortcode_atts( array( 'label' => '' ), (array) $atts, self::TAG );
		$url  = self::store_url();
		if ( '' === $url ) {
			return '';
		}
		$label = '' !== $atts['label'] ? $atts['label'] : __( 'Enter our virtual store', 'aisleza-3d-virtual-store-for-woocommerce' );

		return sprintf( '<a class="aisleza-entry-link button" href="%1$s">%2$s</a>', esc_url( $url ), esc_html( $label ) );
	}

	/**
	 * Banner above the shop grid.
	 */
	public function banner(): void {
		$url = self::store_url();
		if ( '' === $url || ! ( is_shop() || is_product_category() ) ) {
			return;
		}
		printf(
			'<p class="aisleza-entry-banner woocommerce-info">%1$s <a class="button" href="%2$s">%3$s</a></p>',
			esc_html(
				sprintf(
					/* translators: %s: store name */
					__( 'Prefer to browse aisle by aisle? Walk through %s with a trolley.', 'aisleza-3d-virtual-store-for-woocommerce' ),
					Settings::store_name()
				)
			),
			esc_url( $url ),
			esc_html__( 'Enter the virtual store', 'aisleza-3d-virtual-store-for-woocommerce' )
		);
	}
}
