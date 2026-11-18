<?php
/**
 * The optional try-on integration contract.
 *
 * @package Aisleza
 */

namespace Aisleza\Integrations;

defined( 'ABSPATH' ) || exit;

/**
 * Core rendering and commerce code only talks to this interface, never to a try-on plugin.
 * The store works fully with NullTryOn (no try-on anywhere).
 */
interface TryOnProvider {

	public const ABSENT       = 'absent';
	public const INACTIVE     = 'inactive';
	public const INCOMPATIBLE = 'incompatible';
	public const UNCONFIGURED = 'unconfigured';
	public const READY        = 'ready';

	/**
	 * Stable id, e.g. "weargraph" ('' for none).
	 */
	public function id(): string;

	/**
	 * Status for the merchant: { state, title, message, action_url, action_label }.
	 *
	 * @return array{state:string,title:string,message:string,action_url:string,action_label:string}
	 */
	public function status(): array;

	/**
	 * Shoppers can use try-on right now.
	 */
	public function ready(): bool;

	/**
	 * The integration's own verdict for a published product.
	 *
	 * @param int $product_id Product.
	 */
	public function product_eligible( int $product_id ): bool;

	/**
	 * The integration's verdict for one option of an eligible product.
	 *
	 * @param int $product_id   Product.
	 * @param int $variation_id Variation.
	 */
	public function variation_eligible( int $product_id, int $variation_id ): bool;

	/**
	 * Cache-safe browser config for the integration's own fitting flow, or null.
	 *
	 * @return array<string,mixed>|null
	 */
	public function client_config(): ?array;

	/**
	 * Button label chosen in the integration ('' to use the store's default).
	 */
	public function button_label(): string;
}
