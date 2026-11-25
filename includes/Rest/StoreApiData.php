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
