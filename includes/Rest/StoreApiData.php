<?php
/**
 * Live shelf tags: the Store API product carries `extensions.aisleza.new` (added in the last 30 days, filter
 * `aisleza_new_days`), so the store can put a "New" sticker on the shelf. "Only N left" uses WooCommerce's own
 * `low_stock_remaining`.
 *
 * @package Aisleza
 */

namespace Aisleza\Rest;

defined( 'ABSPATH' ) || exit;

/**
 * Store API product extension data.
 */
final class StoreApiData {

	public const NAMESPACE_KEY = 'aisleza';

	/**
	 * Register hooks.
	 */
	public function boot(): void {
		if ( did_action( 'woocommerce_blocks_loaded' ) ) {
			$this->register();
			return;
		}
		add_action( 'woocommerce_blocks_loaded', array( $this, 'register' ) );
	}

	/**
	 * Add the data to the Store API's product schema.
	 */
	public function register(): void {
		if ( ! function_exists( 'woocommerce_store_api_register_endpoint_data' ) || ! class_exists( '\Automattic\WooCommerce\StoreApi\Schemas\V1\ProductSchema' ) ) {
			return;
		}
		woocommerce_store_api_register_endpoint_data(
			array(
				'endpoint'        => \Automattic\WooCommerce\StoreApi\Schemas\V1\ProductSchema::IDENTIFIER,
				'namespace'       => self::NAMESPACE_KEY,
				'data_callback'   => array( $this, 'data' ),
				'schema_callback' => array( $this, 'schema' ),
				'schema_type'     => ARRAY_A,
			)
		);
		if ( class_exists( '\Automattic\WooCommerce\StoreApi\Schemas\V1\CartSchema' ) ) {
			woocommerce_store_api_register_endpoint_data(
				array(
					'endpoint'        => \Automattic\WooCommerce\StoreApi\Schemas\V1\CartSchema::IDENTIFIER,
					'namespace'       => self::NAMESPACE_KEY,
					'data_callback'   => array( $this, 'cart_data' ),
					'schema_callback' => array( $this, 'cart_schema' ),
					'schema_type'     => ARRAY_A,
				)
			);
		}
	}

	/**
	 * The cart's data: how far it is from free shipping (null when the shopper's zone offers no
	 * free shipping by order amount, or the cart needs no shipping).
	 *
	 * @return array{free_shipping:?array{min:int,left:int,reached:bool}}
	 */
	public function cart_data(): array {
		return array( 'free_shipping' => self::free_shipping() );
	}

	/**
	 * Free-shipping progress for the current cart, in the currency's minor units. Follows
	 * WC_Shipping_Free_Shipping::is_available(): the zone of the cart's first package, its enabled
	 * free shipping methods that need a minimum amount ("min_amount" or "either"), and the lowest
	 * of those minimums. A free-shipping coupon that already qualifies counts as reached.
	 *
	 * @return ?array{min:int,left:int,reached:bool}
	 */
	public static function free_shipping(): ?array {
		if ( ! function_exists( 'WC' ) || ! WC()->cart || ! wc_shipping_enabled() || ! WC()->cart->needs_shipping() || ! class_exists( '\WC_Shipping_Zones' ) ) {
			return null;
		}
		$packages = WC()->cart->get_shipping_packages();
		if ( empty( $packages ) ) {
			return null;
		}
		$zone   = \WC_Shipping_Zones::get_zone_matching_package( reset( $packages ) );
		$coupon = false;
		foreach ( WC()->cart->get_coupons() as $c ) {
			if ( $c->is_valid() && $c->get_free_shipping() ) {
				$coupon = true;
				break;
			}
		}
		$best = null;
		foreach ( $zone->get_shipping_methods( true ) as $method ) {
			if ( ! $method instanceof \WC_Shipping_Free_Shipping || ! in_array( $method->requires, array( 'min_amount', 'either' ), true ) ) {
				continue;
			}
			$total = (float) WC()->cart->get_displayed_subtotal();
			if ( 'no' === $method->ignore_discounts ) {
				$total -= (float) WC()->cart->get_discount_total();
				if ( WC()->cart->display_prices_including_tax() ) {
					$total -= (float) WC()->cart->get_discount_tax();
				}
			}
			$row = self::progress( $total, (float) $method->min_amount, wc_get_price_decimals(), 'either' === $method->requires && $coupon );
			if ( null !== $row && ( null === $best || $row['left'] < $best['left'] ) ) {
				$best = $row;
			}
		}

		return $best;
	}

	/**
	 * Progress towards a free-shipping minimum, in minor units.
	 *
	 * @param float $total    The cart amount WooCommerce compares (displayed subtotal, less discounts when they count).
	 * @param float $min      The method's minimum order amount.
	 * @param int   $decimals The currency's decimals.
	 * @param bool  $coupon   A free-shipping coupon already makes the method available.
	 * @return ?array{min:int,left:int,reached:bool} Null when there is no minimum.
	 */
	public static function progress( float $total, float $min, int $decimals, bool $coupon = false ): ?array {
		if ( $min <= 0 ) {
			return null;
		}
		$unit  = 10 ** max( 0, $decimals );
		$min_u = (int) round( $min * $unit );
		$tot_u = (int) round( round( $total, $decimals ) * $unit );
		$left  = $coupon ? 0 : max( 0, $min_u - $tot_u );

		return array(
			'min'     => $min_u,
			'left'    => $left,
			'reached' => 0 === $left,
		);
	}

	/**
	 * The cart data's schema.
	 *
	 * @return array<string,array<string,mixed>>
	 */
	public function cart_schema(): array {
		return array(
			'free_shipping' => array(
				'description' => __( 'Progress towards free shipping (minor units), or null when it does not apply.', 'aisleza-3d-virtual-store-for-woocommerce' ),
				'type'        => array( 'object', 'null' ),
				'context'     => array( 'view', 'edit' ),
				'readonly'    => true,
				'properties'  => array(
					'min'     => array( 'type' => 'integer' ),
					'left'    => array( 'type' => 'integer' ),
					'reached' => array( 'type' => 'boolean' ),
				),
			),
		);
	}

	/**
	 * The product's data.
	 *
	 * @param mixed $product WC_Product.
	 * @return array{new:bool}
	 */
	public function data( $product ): array {
		return array( 'new' => $product instanceof \WC_Product && self::is_new( $product->get_date_created() ? $product->get_date_created()->getTimestamp() : 0, time() ) );
	}

	/**
	 * Whether a product created at $created is new at $now.
	 *
	 * @param int $created Unix time (0: unknown).
	 * @param int $now     Unix time.
	 */
	public static function is_new( int $created, int $now ): bool {
		/**
		 * Days a product counts as new on the shelves (its "New" sticker). 0 turns the sticker off.
		 *
		 * @param int $days Days. Default 30.
		 */
		$days = (int) apply_filters( 'aisleza_new_days', 30 );

		return $days > 0 && $created > 0 && $created <= $now && $now - $created < $days * DAY_IN_SECONDS;
	}

	/**
	 * The data's schema.
	 *
	 * @return array<string,array<string,mixed>>
	 */
	public function schema(): array {
		return array(
			'new' => array(
				'description' => __( 'Whether the product is new (its "New" sticker in the 3D store).', 'aisleza-3d-virtual-store-for-woocommerce' ),
				'type'        => 'boolean',
				'context'     => array( 'view', 'edit' ),
				'readonly'    => true,
			),
		);
	}
}
