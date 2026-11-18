<?php
/**
 * Which try-on integration the store uses (if any).
 *
 * @package Aisleza
 */

namespace Aisleza\Integrations;

defined( 'ABSPATH' ) || exit;

/**
 * Resolved lazily (after all plugins have loaded). When the integration is not ready, the
 * store gets NullTryOn carrying that integration's status for the merchant.
 */
final class Registry {

	/**
	 * Known integrations (for the merchant's Integrations box).
	 *
	 * @var TryOnProvider[]|null
	 */
	private $all = null;

	/**
	 * Every known integration.
	 *
	 * @return TryOnProvider[]
	 */
	public function all(): array {
		if ( null === $this->all ) {
			/**
			 * Try-on integrations. Each must implement TryOnProvider.
			 *
			 * @param TryOnProvider[] $integrations Integrations.
			 */
			$list      = (array) apply_filters( 'aisleza_tryon_integrations', array( new WearGraph() ) );
			$this->all = array_values(
				array_filter(
					$list,
					static function ( $i ) {
						return $i instanceof TryOnProvider;
					}
				)
			);
		}

		return $this->all;
	}

	/**
	 * The integration shoppers get: the first ready one, or NullTryOn.
	 */
	public function tryon(): TryOnProvider {
		foreach ( $this->all() as $integration ) {
			if ( $integration->ready() ) {
				return $integration;
			}
		}
		$first = $this->all()[0] ?? null;

		return new NullTryOn( $first ? $first->status() : array() );
	}
}
