<?php
/**
 * Optional integration: WearGraph – AI Virtual Try-On.
 *
 * @package Aisleza
 */

namespace Aisleza\Integrations;

defined( 'ABSPATH' ) || exit;

/**
 * The only code that knows about WearGraph. Every call is guarded, so a WearGraph update,
 * deactivation or misconfiguration turns try-on off in the store instead of breaking it.
 *
 * Uses WearGraph's public surface: weargraph()->get( 'storefront' ) → product_enabled() /
 * garment(), weargraph()->get( 'providers' ) → configured(), the static
 * Storefront\ButtonRenderer::client_config() / label(), Support\Settings::get(), and the
 * weargraph_loaded action. The fitting room itself (consent, photo, limits, charges, jobs)
 * stays entirely WearGraph's.
 */
final class WearGraph implements TryOnProvider {

	public const MIN_VERSION = '1.0.0';

	public const PLUGIN_FILE = 'weargraph/weargraph.php';

	/**
	 * Cached status for this request.
	 *
	 * @var array<string,string>|null
	 */
	private $status = null;

	/** {@inheritDoc} */
	public function id(): string {
		return 'weargraph';
	}

	/**
	 * WearGraph's storefront service, or null.
	 *
	 * @return object|null
	 */
	private function storefront() {
		if ( ! function_exists( 'weargraph' ) || ! did_action( 'weargraph_loaded' ) ) {
			return null;
		}
		$service = weargraph()->get( 'storefront' );

		return is_object( $service ) && method_exists( $service, 'product_enabled' ) && method_exists( $service, 'garment' ) ? $service : null;
	}

	/**
	 * Read a WearGraph setting, or null.
	 *
	 * @param string $key Key.
	 * @return mixed
	 */
	private static function setting( string $key ) {
		$class = '\\WearGraph\\Support\\Settings';

		return class_exists( $class ) && method_exists( $class, 'get' ) ? call_user_func( array( $class, 'get' ), $key ) : null;
	}

	/** {@inheritDoc} */
	public function status(): array {
		if ( null !== $this->status ) {
			return $this->status;
		}
		$admin = admin_url( 'admin.php?page=weargraph-settings' );
		$s     = array(
			'title'        => __( 'WearGraph — AI Virtual Try-On', 'aisleza-3d-virtual-store-for-woocommerce' ),
			'action_url'   => '',
			'action_label' => '',
		);

		if ( ! defined( 'WEARGRAPH_VERSION' ) ) {
			$installed    = file_exists( WP_PLUGIN_DIR . '/' . self::PLUGIN_FILE );
			$s['state']   = $installed ? self::INACTIVE : self::ABSENT;
			$s['message'] = $installed
				? __( 'WearGraph is installed but not active. Activate it if you want try-on in the store.', 'aisleza-3d-virtual-store-for-woocommerce' )
				: __( 'Not installed. This is optional; your virtual store works fully without it.', 'aisleza-3d-virtual-store-for-woocommerce' );
			if ( $installed && current_user_can( 'activate_plugins' ) ) {
				$s['action_url']   = admin_url( 'plugins.php?plugin_status=inactive' );
				$s['action_label'] = __( 'Go to Plugins', 'aisleza-3d-virtual-store-for-woocommerce' );
			}
		} elseif ( version_compare( WEARGRAPH_VERSION, self::MIN_VERSION, '<' ) || ! $this->storefront() || null === $this->client_config() ) {
			$s['state']   = self::INCOMPATIBLE;
			$s['message'] = sprintf(
				/* translators: %s: version */
				__( 'This WearGraph version is not compatible or is not running. Update WearGraph to %s or newer and check its notices. Shopping is not affected.', 'aisleza-3d-virtual-store-for-woocommerce' ),
				self::MIN_VERSION
			);
			$s['action_url']   = admin_url( 'plugins.php' );
			$s['action_label'] = __( 'Go to Plugins', 'aisleza-3d-virtual-store-for-woocommerce' );
		} elseif ( ! $this->provider_connected() ) {
			$s['state']        = self::UNCONFIGURED;
			$s['message']      = __( 'WearGraph is active but no AI provider is connected yet, so try-on is hidden in the store.', 'aisleza-3d-virtual-store-for-woocommerce' );
			$s['action_url']   = add_query_arg( 'tab', 'provider', $admin );
			$s['action_label'] = __( 'Connect a provider', 'aisleza-3d-virtual-store-for-woocommerce' );
		} elseif ( ! self::setting( 'tryon_enabled' ) && ! self::setting( 'preview_mode' ) ) {
			$s['state']        = self::UNCONFIGURED;
			$s['message']      = __( 'WearGraph is connected but try-on is switched off, so it is hidden in the store.', 'aisleza-3d-virtual-store-for-woocommerce' );
			$s['action_url']   = add_query_arg( 'tab', 'tryon', $admin );
			$s['action_label'] = __( 'Turn on try-on', 'aisleza-3d-virtual-store-for-woocommerce' );
		} else {
			$s['state']        = self::READY;
			$s['message']      = self::setting( 'tryon_enabled' )
				? __( 'Ready. "Try on me" appears on products WearGraph marks as ready in its Catalog.', 'aisleza-3d-virtual-store-for-woocommerce' )
				: __( 'Ready in preview mode: only store managers see "Try on me".', 'aisleza-3d-virtual-store-for-woocommerce' );
			$s['action_url']   = admin_url( 'admin.php?page=weargraph-catalog' );
			$s['action_label'] = __( 'Manage in WearGraph', 'aisleza-3d-virtual-store-for-woocommerce' );
		}

		$this->status = $s;
		return $s;
	}

	/**
	 * A provider is connected in WearGraph.
	 */
	private function provider_connected(): bool {
		$providers = function_exists( 'weargraph' ) ? weargraph()->get( 'providers' ) : null;
		if ( ! is_object( $providers ) || ! method_exists( $providers, 'configured' ) ) {
			return false;
		}
		$configured = $providers->configured();

		return is_object( $configured ) && method_exists( $configured, 'is_configured' ) && $configured->is_configured();
	}

	/** {@inheritDoc} */
	public function ready(): bool {
		return self::READY === $this->status()['state'];
	}

	/** {@inheritDoc} */
	public function product_eligible( int $product_id ): bool {
		$service = $this->storefront();
		if ( ! $service || $product_id <= 0 ) {
			return false;
		}
		try {
			return (bool) $service->product_enabled( $product_id );
		} catch ( \Throwable $e ) {
			return false;
		}
	}

	/** {@inheritDoc} */
	public function variation_eligible( int $product_id, int $variation_id ): bool {
		$service = $this->storefront();
		if ( ! $service || ! $this->product_eligible( $product_id ) ) {
			return false;
		}
		if ( $variation_id && (int) wp_get_post_parent_id( $variation_id ) !== $product_id ) {
			return false;
		}
		try {
			return null !== $service->garment( $product_id, $variation_id );
		} catch ( \Throwable $e ) {
			return false;
		}
	}

	/** {@inheritDoc} */
	public function client_config(): ?array {
		$class = '\\WearGraph\\Storefront\\ButtonRenderer';
		if ( ! class_exists( $class ) || ! method_exists( $class, 'client_config' ) ) {
			return null;
		}
		try {
			$config = call_user_func( array( $class, 'client_config' ) );
		} catch ( \Throwable $e ) {
			return null;
		}

		return is_array( $config ) && ! empty( $config['modalJs'] ) ? $config : null;
	}

	/** {@inheritDoc} */
	public function button_label(): string {
		$class = '\\WearGraph\\Storefront\\ButtonRenderer';
		if ( ! class_exists( $class ) || ! method_exists( $class, 'label' ) ) {
			return '';
		}
		try {
			return (string) call_user_func( array( $class, 'label' ) );
		} catch ( \Throwable $e ) {
			return '';
		}
	}
}
