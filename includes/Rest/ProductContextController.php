<?php
/**
 * REST: the few storefront facts the Store API does not carry.
 *
 * @package Aisleza
 */

namespace Aisleza\Rest;

defined( 'ABSPATH' ) || exit;

use Aisleza\Integrations\Registry;

/**
 * GET /aisleza/v1/tryon?ids=1,2,3   which of these products the try-on integration supports
 * GET /aisleza/v1/product/{id}?variation=  try-on state + default attributes
 *
 * Products, prices, stock and the cart come from the WooCommerce Store API; these routes add
 * only the try-on integration's verdicts and the product's default attributes. Published products only:
 * drafts, private, trashed and password-protected products answer exactly like missing ones.
 * Responses are no-store, because an integration's preview mode can make the verdict viewer-specific.
 */
final class ProductContextController {

	public const NAMESPACE_V1 = 'aisleza/v1';

	public const MAX_IDS = 50;

	/**
	 * Optional integrations.
	 *
	 * @var Registry
	 */
	private $integrations;

	/**
	 * Constructor.
	 *
	 * @param Registry $integrations Optional integrations.
	 */
	public function __construct( Registry $integrations ) {
		$this->integrations = $integrations;
	}

	/**
	 * Register routes.
	 */
	public function register_routes(): void {
		register_rest_route(
			self::NAMESPACE_V1,
			'/tryon',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'tryon' ),
				'permission_callback' => '__return_true', // Public storefront facts, the same the Try On button reveals on product pages.
				'args'                => array(
					'ids' => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);
		register_rest_route(
			self::NAMESPACE_V1,
			'/product/(?P<id>\d+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'product' ),
				'permission_callback' => '__return_true', // Public storefront facts for published products only.
				'args'                => array(
					'id'        => array(
						'type'     => 'integer',
						'required' => true,
						'minimum'  => 1,
					),
					'variation' => array(
						'type'    => 'integer',
						'default' => 0,
						'minimum' => 0,
					),
				),
			)
		);
	}

	/**
	 * Parse "1,2,3" into at most MAX_IDS unique positive ids.
	 *
	 * @param string $raw Raw list.
	 * @return int[]
	 */
	public static function parse_ids( string $raw ): array {
		$ids = array_values( array_unique( array_filter( array_map( 'absint', explode( ',', $raw ) ) ) ) );

		return array_slice( $ids, 0, self::MAX_IDS );
	}

	/**
	 * A product a shopper may see: published, not password protected, not a variation.
	 *
	 * @param int $id Product id.
	 * @return \WC_Product|null
	 */
	public static function public_product( int $id ) {
		$product = $id ? wc_get_product( $id ) : null;
		if ( ! $product || $product->is_type( 'variation' ) || 'publish' !== $product->get_status() || post_password_required( $id ) ) {
			return null;
		}

		return $product;
	}

	/**
	 * GET /tryon.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function tryon( \WP_REST_Request $request ) {
		$ids = self::parse_ids( (string) $request['ids'] );
		if ( ! $ids ) {
			return new \WP_Error( 'aisleza_bad_ids', __( 'No products were given.', 'aisleza-3d-virtual-store-for-woocommerce' ), array( 'status' => 400 ) );
		}

		// Without a ready integration (absent, deactivated mid-visit, unconfigured) nothing is eligible.
		$tryon    = $this->integrations->tryon();
		$eligible = array();
		foreach ( $ids as $id ) {
			if ( self::public_product( $id ) && $tryon->product_eligible( $id ) ) {
				$eligible[] = $id;
			}
		}

		return self::no_store( array( 'eligible' => $eligible ) );
	}

	/**
	 * GET /product/{id}.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function product( \WP_REST_Request $request ) {
		$id      = absint( $request['id'] );
		$product = self::public_product( $id );
		if ( ! $product ) {
			return new \WP_Error( 'aisleza_not_found', __( 'This product is not available.', 'aisleza-3d-virtual-store-for-woocommerce' ), array( 'status' => 404 ) );
		}

		$variation = absint( $request['variation'] );
		if ( $variation && ( ! $product->is_type( 'variable' ) || (int) wp_get_post_parent_id( $variation ) !== $id || 'publish' !== get_post_status( $variation ) ) ) {
			return new \WP_Error( 'aisleza_bad_variation', __( 'Please choose an option of this product.', 'aisleza-3d-virtual-store-for-woocommerce' ), array( 'status' => 400 ) );
		}

		$provider = $this->integrations->tryon();
		$tryon    = $provider->product_eligible( $id );

		return self::no_store(
			array(
				'id'                => $id,
				'tryon'             => $tryon,
				'variation_id'      => $variation,
				'variation_tryon'   => $variation ? ( $tryon && $provider->variation_eligible( $id, $variation ) ) : null,
				'default_variation' => $product->is_type( 'variable' ) ? self::default_attributes( $product ) : (object) array(),
			)
		);
	}

	/**
	 * Default attributes keyed by the label the Store API uses in `variations[].attributes[].name`.
	 *
	 * @param \WC_Product $product Variable product.
	 * @return array<string,string>|object
	 */
	public static function default_attributes( \WC_Product $product ) {
		$defaults = (array) $product->get_default_attributes();
		$out      = array();
		foreach ( $product->get_attributes() as $key => $attribute ) {
			if ( ! $attribute instanceof \WC_Product_Attribute || ! $attribute->get_variation() ) {
				continue;
			}
			$value = $defaults[ $key ] ?? ( $defaults[ sanitize_title( $attribute->get_name() ) ] ?? '' );
			if ( '' !== (string) $value ) {
				$out[ wc_attribute_label( $attribute->get_name(), $product ) ] = (string) $value;
			}
		}

		return $out ? $out : (object) array();
	}

	/**
	 * JSON response that no cache may keep.
	 *
	 * @param array<string,mixed> $data Data.
	 */
	private static function no_store( array $data ): \WP_REST_Response {
		$response = rest_ensure_response( $data );
		$response->header( 'Cache-Control', 'no-store, private' );

		return $response;
	}
}
