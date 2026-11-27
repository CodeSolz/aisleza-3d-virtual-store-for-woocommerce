<?php
/**
 * [aisleza] — the store's mount point, assets and static config.
 *
 * @package Aisleza
 */

namespace Aisleza\Frontend;

defined( 'ABSPATH' ) || exit;

use Aisleza\Integrations\Registry;
use Aisleza\Catalog\QueryAisles;
use Aisleza\Catalog\Sections;
use Aisleza\Settings;
use Aisleza\Skins\Registry as Skins;

/**
 * The HTML and config are the same for every shopper (no nonce, no cart, no session), so
 * full-page caches stay safe. The cart and its Store API nonce are fetched by the browser.
 * Assets load only where the shortcode renders.
 */
final class Shortcode {

	public const TAG = 'aisleza';

	/**
	 * The only markup render() produces, for wp_kses() when the full-window template prints it.
	 */
	public const KSES = array(
		'div'      => array(
			'id'    => true,
			'class' => true,
			'role'  => true,
		),
		'p'        => array( 'class' => true ),
		'a'        => array(
			'class' => true,
			'href'  => true,
		),
		'noscript' => array(),
	);

	/**
	 * Sections.
	 *
	 * @var Sections
	 */
	private $sections;

	/**
	 * Optional integrations (try-on).
	 *
	 * @var Registry
	 */
	private $integrations;

	/**
	 * Constructor.
	 *
	 * @param Sections        $sections Sections.
	 * @param Registry $integrations Optional integrations.
	 */
	public function __construct( Sections $sections, Registry $integrations ) {
		$this->sections     = $sections;
		$this->integrations = $integrations;
	}

	/**
	 * Register hooks.
	 */
	public function boot(): void {
		add_shortcode( self::TAG, array( $this, 'render' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'register_assets' ) );
	}

	/**
	 * Store managers can open a disabled store to preview it.
	 */
	public static function can_preview(): bool {
		return current_user_can( 'manage_woocommerce' );
	}

	/**
	 * Whether this visitor gets the store (enabled, or a manager previewing it).
	 */
	public static function open_for_viewer(): bool {
		return (bool) Settings::get( 'enabled' ) || self::can_preview();
	}

	/**
	 * Cache-busting version for a bundled asset.
	 *
	 * @param string $rel Path relative to the plugin.
	 */
	public static function asset_version( string $rel ): string {
		$path = AISLEZA_DIR . $rel;

		return AISLEZA_VERSION . ( is_readable( $path ) ? '.' . filemtime( $path ) : '' );
	}

	/**
	 * Register scripts and styles (enqueued by render()).
	 */
	public function register_assets(): void {
		$ver = array( self::class, 'asset_version' );

		wp_register_style( 'aisleza-store', AISLEZA_URL . 'assets/css/store.css', array(), $ver( 'assets/css/store.css' ) );
		wp_register_script( 'aisleza-core', AISLEZA_URL . 'assets/js/core.js', array(), $ver( 'assets/js/core.js' ), true );
		wp_register_script( 'aisleza-bridge', AISLEZA_URL . 'assets/js/bridge.js', array( 'aisleza-core' ), $ver( 'assets/js/bridge.js' ), true );
		wp_register_script( 'aisleza-store', AISLEZA_URL . 'assets/js/store.js', array( 'aisleza-core' ), $ver( 'assets/js/store.js' ), true );
	}

	/**
	 * Shortcode callback.
	 *
	 * @param array<string,string>|string $atts Attributes (none used).
	 */
	public function render( $atts = array() ): string {
		unset( $atts );
		$shop = function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'shop' ) : home_url( '/' );

		if ( ! self::open_for_viewer() ) {
			return sprintf(
				'<div class="aisleza-closed"><p>%1$s</p><p><a href="%2$s">%3$s</a></p></div>',
				esc_html__( 'Our virtual store is closed right now.', 'aisleza-3d-virtual-store-for-woocommerce' ),
				esc_url( $shop ),
				esc_html__( 'Visit the shop', 'aisleza-3d-virtual-store-for-woocommerce' )
			);
		}
		// No "once per page" flag: SEO plugins and themes render content for excerpts in wp_head,
		// which would swallow the real store. A second root on a page is handled by store.js.
		if ( ! wp_script_is( 'aisleza-store', 'registered' ) ) {
			$this->register_assets();
		}
		wp_enqueue_style( 'aisleza-store' );
		wp_add_inline_style( 'aisleza-store', '.aisleza-root{--aisleza-accent:' . (string) Settings::get( 'accent' ) . ';}' ); // A sanitized #rrggbb.
		if ( $this->integrations->tryon()->ready() ) {
			wp_enqueue_script( 'aisleza-bridge' ); // Only with a ready try-on integration.
		}
		wp_enqueue_script( 'aisleza-store' );
		wp_add_inline_script( 'aisleza-core', 'window.aislezaConfig = ' . wp_json_encode( $this->config() ) . ';', 'before' );

		$layout = 'full' === Settings::get( 'layout' ) && PageTemplate::is_store_page() ? 'full' : 'theme';

		ob_start();
		?>
		<div class="aisleza aisleza-root aisleza--<?php echo esc_attr( $layout ); ?>">
			<div class="aisleza-boot" role="status">
				<p class="aisleza-boot__name"><?php echo esc_html( Settings::store_name() ); ?></p>
				<p class="aisleza-boot__text"><?php esc_html_e( 'Opening the store…', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></p>
				<p><a class="aisleza-boot__link" href="<?php echo esc_url( $shop ); ?>"><?php esc_html_e( 'Shop the regular way instead', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></a></p>
			</div>
			<noscript>
				<p class="aisleza-noscript"><?php esc_html_e( 'The virtual store needs JavaScript.', 'aisleza-3d-virtual-store-for-woocommerce' ); ?> <a href="<?php echo esc_url( $shop ); ?>"><?php esc_html_e( 'Visit the shop', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></a></p>
			</noscript>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * Static client config.
	 *
	 * @return array<string,mixed>
	 */
	public function config(): array {
		$settings = Settings::all();
		$sections = QueryAisles::merge( $this->sections->build( $settings ), $settings );
		$provider = $this->integrations->tryon();
		$tryon    = $provider->ready() ? $provider->client_config() : null;
		$preview  = ! $settings['enabled'] && self::can_preview();
		$sort     = self::sort();
		$skin     = Skins::active();

		$config = array(
			'version'     => AISLEZA_VERSION,
			'storeName'   => Settings::store_name(),
			'accent'      => $settings['accent'],
			'skin'        => $skin['data'], // null = the built-in Boutique skin.
			'logo'        => null, // An add-on's store logo { url, width, height }; null = the name alone.
			'preview'     => $preview,
			'storeApi'    => esc_url_raw( rest_url( 'wc/store/v1/' ) ),
			'api'         => esc_url_raw( rest_url( 'aisleza/v1/' ) ),
			'shopUrl'     => esc_url_raw( (string) wc_get_page_permalink( 'shop' ) ),
			'cartUrl'     => esc_url_raw( (string) wc_get_cart_url() ),
			'checkoutUrl' => esc_url_raw( (string) wc_get_checkout_url() ),
			'homeUrl'     => esc_url_raw( home_url( '/' ) ),
			'view'        => $settings['view'],
			'openSize'    => $settings['open_size'],
			'search'      => true, // false: an add-on offers its own way to find products.
			'worldJs'     => esc_url_raw( AISLEZA_URL . 'assets/js/world.js?ver=' . self::asset_version( 'assets/js/world.js' ) ),
			'perShelf'    => (int) $settings['per_shelf'],
			'orderby'     => $sort[0],
			'order'       => $sort[1],
			'sections'    => $sections,
			'taxIncl'     => wc_tax_enabled() && 'incl' === get_option( 'woocommerce_tax_display_cart' ),
			'ratings'     => function_exists( 'wc_review_ratings_enabled' ) && wc_review_ratings_enabled(), // WooCommerce → Products → star ratings on reviews.
			'currency'    => self::currency(),
			'placeholder' => esc_url_raw( (string) wc_placeholder_img_src( 'woocommerce_single' ) ),
			'tryon'       => array(
				'available' => null !== $tryon,
				'config'    => $tryon,
				'label'     => $provider->button_label(),
			),
			'i18n'        => Strings::all(),
		);

		/**
		 * The store's browser config, last chance for add-ons to add their own keys.
		 *
		 * Must stay cache-safe (the same for every shopper). A listener that returns something
		 * other than an array is ignored.
		 *
		 * @param array<string,mixed> $config Config.
		 */
		$filtered = apply_filters( 'aisleza_store_config', $config );
		return is_array( $filtered ) ? $filtered : $config;
	}

	/**
	 * The shop's default product sorting as Store API orderby/order.
	 *
	 * @return array{0:string,1:string}
	 */
	public static function sort(): array {
		$map = array(
			'menu_order' => array( 'menu_order', 'asc' ),
			'popularity' => array( 'popularity', 'desc' ),
			'rating'     => array( 'rating', 'desc' ),
			'date'       => array( 'date', 'desc' ),
			'price'      => array( 'price', 'asc' ),
			'price-desc' => array( 'price', 'desc' ),
			'title'      => array( 'title', 'asc' ),
		);
		$key = (string) apply_filters( 'woocommerce_default_catalog_orderby', get_option( 'woocommerce_default_catalog_orderby', 'menu_order' ) ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- WooCommerce's own filter, read the same way WooCommerce does.

		return $map[ $key ] ?? $map['menu_order'];
	}

	/**
	 * The store currency in the Store API's shape, used until the first cart response
	 * (which carries its own currency data) arrives.
	 *
	 * @return array<string,mixed>
	 */
	public static function currency(): array {
		$symbol = html_entity_decode( get_woocommerce_currency_symbol(), ENT_QUOTES, 'UTF-8' );
		$format = get_woocommerce_price_format();
		$prefix = '';
		$suffix = '';
		switch ( $format ) {
			case '%1$s%2$s':
				$prefix = $symbol;
				break;
			case '%1$s&nbsp;%2$s':
				$prefix = $symbol . ' ';
				break;
			case '%2$s%1$s':
				$suffix = $symbol;
				break;
			case '%2$s&nbsp;%1$s':
				$suffix = ' ' . $symbol;
				break;
		}

		return array(
			'currency_code'               => get_woocommerce_currency(),
			'currency_symbol'             => $symbol,
			'currency_minor_unit'         => wc_get_price_decimals(),
			'currency_decimal_separator'  => wc_get_price_decimal_separator(),
			'currency_thousand_separator' => wc_get_price_thousand_separator(),
			'currency_prefix'             => $prefix,
			'currency_suffix'             => $suffix,
		);
	}
}
