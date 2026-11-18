<?php
/**
 * No try-on integration: ordinary shopping only.
 *
 * @package Aisleza
 */

namespace Aisleza\Integrations;

defined( 'ABSPATH' ) || exit;

/**
 * Used when no try-on plugin is installed, active, compatible and configured. It can carry the
 * status of the integration that is not ready, so the merchant still sees what to do.
 */
final class NullTryOn implements TryOnProvider {

	/**
	 * Status shown to the merchant.
	 *
	 * @var array{state:string,title:string,message:string,action_url:string,action_label:string}
	 */
	private $status;

	/**
	 * Constructor.
	 *
	 * @param array<string,string> $status Status of an integration that is not ready (optional).
	 */
	public function __construct( array $status = array() ) {
		$this->status = array_merge(
			array(
				'state'        => self::ABSENT,
				'title'        => '',
				'message'      => '',
				'action_url'   => '',
				'action_label' => '',
			),
			$status
		);
	}

	/** {@inheritDoc} */
	public function id(): string {
		return '';
	}

	/** {@inheritDoc} */
	public function status(): array {
		return $this->status;
	}

	/** {@inheritDoc} */
	public function ready(): bool {
		return false;
	}

	/** {@inheritDoc} */
	public function product_eligible( int $product_id ): bool {
		unset( $product_id );
		return false;
	}

	/** {@inheritDoc} */
	public function variation_eligible( int $product_id, int $variation_id ): bool {
		unset( $product_id, $variation_id );
		return false;
	}

	/** {@inheritDoc} */
	public function client_config(): ?array {
		return null;
	}

	/** {@inheritDoc} */
	public function button_label(): string {
		return '';
	}
}
