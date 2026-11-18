<?php
/**
 * Aisleza (its own admin menu): setup and settings.
 *
 * @package Aisleza
 */

namespace Aisleza\Admin;

defined( 'ABSPATH' ) || exit;

use Aisleza\Brand;
use Aisleza\Catalog\QueryAisles;
use Aisleza\Catalog\Sections;
use Aisleza\Frontend\EntryLink;
use Aisleza\Frontend\Shortcode;
use Aisleza\Integrations\Registry;
use Aisleza\Integrations\TryOnProvider;
use Aisleza\Settings;

/**
 * One page under the WooCommerce menu: a five-step setup checklist, the settings form and the
 * optional integrations. Saving goes through admin-post with a nonce, manage_woocommerce and
 * the whitelist sanitizer Settings::sanitize().
 */
final class SettingsPage {

	public const PAGE = 'aisleza';

	private const NONCE_SAVE = 'aisleza_save';

	private const NONCE_PAGE = 'aisleza_create_page';

	private const NONCE_NOTICE = 'aisleza_notice';

	/**
	 * This page's admin hook suffix (set when the menu is added).
	 *
	 * @var string
	 */
	private $hook = '';

	/**
	 * Admin page hooks of every Aisleza page (for the page assets).
	 *
	 * @var string[]
	 */
	private $hooks = array();

	/**
	 * Sections.
	 *
	 * @var Sections
	 */
	private $sections;

	/**
	 * Optional integrations.
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
		add_action( 'admin_menu', array( $this, 'menu' ), 60 );
		add_action( 'admin_post_aisleza_save', array( $this, 'save' ) );
		add_action( 'admin_post_aisleza_create_page', array( $this, 'create_page' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'menu_icon' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( AISLEZA_FILE ), array( $this, 'action_links' ) );
	}

	/**
	 * Store settings are a shop-management task.
	 */
	public static function capability(): string {
		return 'manage_woocommerce';
	}

	/**
	 * URL of an Aisleza page (the main settings page by default).
	 *
	 * @param array<string,string|int> $args Extra query args.
	 * @param string                   $page Page slug, from pages().
	 */
	public static function url( array $args = array(), string $page = self::PAGE ): string {
		return add_query_arg( array_merge( array( 'page' => $page ), $args ), admin_url( 'admin.php' ) );
	}

	/**
	 * The pages of Aisleza's menu: slug => { menu, title, order, anchors }. Add-ons add their own
	 * through the `aisleza_admin_pages` filter and fill them through the `aisleza_admin_page`
	 * action. `anchors` are the element ids a page holds, so an old link to the single settings
	 * page (…page=aisleza#that-id) still finds its way.
	 *
	 * @return array<string,array{menu:string,title:string,order:int,anchors:array<int,string>}>
	 */
	public static function pages(): array {
		$pages = array(
			self::PAGE => array(
				'menu'    => __( 'Settings', 'aisleza-3d-virtual-store-for-woocommerce' ),
				'title'   => Brand::name(),
				'order'   => 10,
				'anchors' => array( 'aisleza-card-page', 'aisleza-page', 'aisleza-store', 'aisleza-sections', 'aisleza-integrations' ),
			),
		);
		/**
		 * Pages of Aisleza's admin menu.
		 *
		 * @param array<string,array<string,mixed>> $pages slug => { menu, title, order, anchors }.
		 */
		$pages = apply_filters( 'aisleza_admin_pages', $pages );
		$out   = array();
		foreach ( is_array( $pages ) ? $pages : array() as $slug => $page ) {
			if ( ! is_string( $slug ) || 0 !== strpos( $slug, 'aisleza' ) || ! preg_match( '/^[a-z0-9-]{1,40}$/', $slug ) || ! is_array( $page ) ) {
				continue;
			}
			$out[ $slug ] = array(
				'menu'    => (string) ( $page['menu'] ?? $slug ),
				'title'   => (string) ( $page['title'] ?? ( $page['menu'] ?? $slug ) ),
				'order'   => (int) ( $page['order'] ?? 50 ),
				'anchors' => array_values( array_filter( array_map( 'strval', (array) ( $page['anchors'] ?? array() ) ) ) ),
			);
		}
		uasort(
			$out,
			static function ( $a, $b ) {
				return $a['order'] <=> $b['order'];
			}
		);
		return $out;
	}

	/**
	 * Aisleza's own menu, just after WooCommerce's: Settings first, then each page add-ons add.
	 */
	public function menu(): void {
		// The mark is drawn by assets/css/admin-menu.css in the admin colour scheme ('none' = no image).
		$this->hook    = (string) add_menu_page( Brand::name(), Brand::short_name(), self::capability(), self::PAGE, array( $this, 'render' ), Brand::mark() ? 'none' : 'dashicons-store', '55.9' );
		$this->hooks[] = $this->hook;
		foreach ( self::pages() as $slug => $page ) {
			$hook = add_submenu_page(
				self::PAGE,
				$page['title'],
				$page['menu'],
				self::capability(),
				$slug,
				// The first item shares the menu's own page: the same callback, so it draws once.
				self::PAGE === $slug ? array( $this, 'render' ) : function () use ( $slug ) {
					$this->render( $slug );
				}
			);
			if ( $hook ) {
				$this->hooks[] = (string) $hook;
			}
		}
	}

	/**
	 * The brand mark in colour, for the page header (printed through wp_kses with only these tags).
	 */
	private static function render_mark(): void {
		if ( ! Brand::mark() ) {
			return;
		}
		$svg = '<svg class="aisleza-hero__mark" viewBox="0 0 1254 1254" aria-hidden="true" focusable="false"><rect width="1254" height="1254" rx="290" fill="#0e1d30"/><path fill="#0edba5" d="M425 330Q445 300 476 316L572 376Q581 383 577 393L385 919Q381 928 370 928L170 928Q131 925 139 882ZM829 330Q809 300 778 316L682 376Q673 383 677 393L869 919Q873 928 884 928L1084 928Q1123 925 1115 882ZM540 617L714 617Q721 617 723 624L740 681Q742 689 734 689L520 689Q512 689 514 681L531 624Q533 617 540 617Z"/></svg>';
		echo wp_kses(
			$svg,
			array(
				'svg'  => array(
					'class'       => true,
					'viewbox'     => true,
					'aria-hidden' => true,
					'focusable'   => true,
				),
				'rect' => array(
					'width'  => true,
					'height' => true,
					'rx'     => true,
					'fill'   => true,
				),
				'path' => array(
					'd'    => true,
					'fill' => true,
				),
			)
		);
	}

	/**
	 * The menu icon's stylesheet, on every admin screen where the menu shows.
	 */
	public function menu_icon(): void {
		if ( Brand::mark() && current_user_can( self::capability() ) ) {
			wp_enqueue_style( 'aisleza-admin-menu', AISLEZA_URL . 'assets/css/admin-menu.css', array(), \Aisleza\Frontend\Shortcode::asset_version( 'assets/css/admin-menu.css' ) );
		}
	}

	/**
	 * This page with a result message (saved, created…), signed so only our own redirects
	 * can make the page show one.
	 *
	 * @param string $notice Message key.
	 */
	private static function back( string $notice ): string {
		return self::url(
			array(
				'aisleza'  => $notice,
				'_wpnonce' => wp_create_nonce( self::NONCE_NOTICE ),
			)
		);
	}

	/**
	 * "Settings" link on the Plugins screen.
	 *
	 * @param string[] $links Links.
	 * @return string[]
	 */
	public function action_links( $links ) {
		array_unshift( $links, sprintf( '<a href="%1$s">%2$s</a>', esc_url( self::url() ), esc_html__( 'Settings', 'aisleza-3d-virtual-store-for-woocommerce' ) ) );

		return $links;
	}

	/**
	 * The page's stylesheet and its section menu script, on this page only.
	 *
	 * @param string $hook Admin page hook.
	 */
	public function enqueue( $hook ): void {
		if ( in_array( $hook, $this->hooks, true ) ) {
			wp_enqueue_style( 'aisleza-admin', AISLEZA_URL . 'assets/css/admin.css', array(), \Aisleza\Frontend\Shortcode::asset_version( 'assets/css/admin.css' ) );
			wp_enqueue_script( 'aisleza-admin', AISLEZA_URL . 'assets/js/admin.js', array(), \Aisleza\Frontend\Shortcode::asset_version( 'assets/js/admin.js' ), true );
		}
	}

	/**
	 * Render an Aisleza page. Its parts are tabs (elements with the class `aisleza-tab` and a
	 * `data-tab-label`): the page script lists them on the left and shows one at a time.
	 *
	 * @param string $slug Page slug.
	 */
	public function render( $slug = self::PAGE ): void {
		if ( ! current_user_can( self::capability() ) ) {
			return;
		}
		$pages = self::pages();
		$slug  = is_string( $slug ) && isset( $pages[ $slug ] ) ? $slug : self::PAGE;
		// Old links to the single settings page: anchors that now live on another page.
		$forward = array();
		foreach ( $pages as $other => $page ) {
			if ( $other !== $slug ) {
				foreach ( $page['anchors'] as $anchor ) {
					$forward[ $anchor ] = self::url( array(), $other );
				}
			}
		}
		$settings = Settings::all();
		$page_id  = (int) $settings['page_id'];
		$page     = $page_id ? get_post( $page_id ) : null;
		if ( $page && ( 'page' !== $page->post_type || 'trash' === $page->post_status ) ) {
			$page = null;
		}
		$notice = '';
		if ( isset( $_GET['aisleza'], $_GET['_wpnonce'] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ), self::NONCE_NOTICE ) ) {
			$notice = sanitize_key( wp_unslash( $_GET['aisleza'] ) );
		}

		echo '<div class="wrap aisleza-admin" data-unsaved="' . esc_attr__( 'Unsaved changes', 'aisleza-3d-virtual-store-for-woocommerce' ) . '" data-page="' . esc_attr( $slug ) . '" data-forward="' . esc_attr( (string) wp_json_encode( $forward ) ) . '">';
		$this->render_header( $settings, $page );
		echo '<hr class="wp-header-end">';
		if ( self::PAGE === $slug ) {
			$this->render_notice( $notice );
		}
		echo '<div class="aisleza-layout"><nav class="aisleza-nav" aria-label="' . esc_attr( $pages[ $slug ]['menu'] ) . '" hidden></nav><div class="aisleza-main">';
		if ( self::PAGE === $slug ) {
			$this->render_steps( $settings, $page );
			echo '<div class="aisleza-admin__card aisleza-tab" id="aisleza-card-page" data-tab-label="' . esc_attr__( 'Store page', 'aisleza-3d-virtual-store-for-woocommerce' ) . '">';
			$this->render_page_box( $settings, $page );
			echo '</div><div class="aisleza-admin__card" id="aisleza-card-store">';
			$this->render_form( $settings, $page );
			echo '</div><div class="aisleza-admin__card aisleza-tab" id="aisleza-integrations" data-tab-label="' . esc_attr__( 'Integrations', 'aisleza-3d-virtual-store-for-woocommerce' ) . '">';
			$this->render_integrations();
			echo '</div>';

			/**
			 * Older add-ons add cards to the main settings page here. Each prints a complete card
			 * with its own form, capability check and nonce; with a `aisleza-tab` class and a
			 * `data-tab-label` it becomes a tab.
			 *
			 * @param array<string,mixed> $settings The store settings.
			 */
			do_action( 'aisleza_settings_sections', $settings );
		} else {
			/**
			 * An add-on's page (from the `aisleza_admin_pages` filter): print its cards. Each card
			 * has its own form, capability check and nonce; cards and parts of a card with the
			 * class `aisleza-tab` and a `data-tab-label` become the page's tabs.
			 *
			 * @param string              $slug     The page.
			 * @param array<string,mixed> $settings The store settings.
			 */
			do_action( 'aisleza_admin_page', $slug, $settings );
		}
		echo '</div></div></div>';
	}

	/**
	 * The brand header: mark, name, version, the store's state and the way into it.
	 *
	 * @param array<string,mixed> $settings Settings.
	 * @param \WP_Post|null       $page     Selected page.
	 */
	private function render_header( array $settings, $page ): void {
		$aisles = count( QueryAisles::merge( $this->sections->build( $settings ), $settings ) );
		if ( ! $page ) {
			$state = array( 'todo', __( 'Not set up yet', 'aisleza-3d-virtual-store-for-woocommerce' ) );
		} elseif ( 'publish' !== $page->post_status ) {
			$state = array( 'draft', __( 'Draft: only you can preview it', 'aisleza-3d-virtual-store-for-woocommerce' ) );
		} elseif ( ! $settings['enabled'] ) {
			$state = array( 'off', __( 'Switched off', 'aisleza-3d-virtual-store-for-woocommerce' ) );
		} else {
			$state = array( 'live', __( 'Open to shoppers', 'aisleza-3d-virtual-store-for-woocommerce' ) );
		}
		?>
		<header class="aisleza-hero">
			<div class="aisleza-hero__brand">
				<?php self::render_mark(); ?>
				<div>
					<h1 class="aisleza-hero__name"><?php echo esc_html( Brand::name() ); ?></h1>
					<p class="aisleza-hero__tagline"><?php echo esc_html( Brand::tagline() ); ?></p>
				</div>
			</div>
			<div class="aisleza-hero__side">
				<ul class="aisleza-hero__facts">
					<li class="aisleza-state aisleza-state--<?php echo esc_attr( $state[0] ); ?>"><span class="aisleza-state__dot" aria-hidden="true"></span><?php echo esc_html( $state[1] ); ?></li>
					<li>
						<?php
						/* translators: %d: number of aisles */
						echo esc_html( sprintf( _n( '%d aisle', '%d aisles', $aisles, 'aisleza-3d-virtual-store-for-woocommerce' ), $aisles ) );
						?>
					</li>
					<li><?php echo esc_html( 'v' . AISLEZA_VERSION ); ?></li>
				</ul>
				<?php if ( $page ) : ?>
					<a class="button aisleza-hero__open" href="<?php echo esc_url( 'publish' === $page->post_status ? (string) get_permalink( $page ) : (string) get_preview_post_link( $page ) ); ?>" target="_blank" rel="noopener"><?php echo 'publish' === $page->post_status ? esc_html__( 'Open store', 'aisleza-3d-virtual-store-for-woocommerce' ) : esc_html__( 'Preview store', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></a>
				<?php endif; ?>
			</div>
		</header>
		<?php
	}

	/**
	 * The five setup steps with their state; each links to its part of this page (no wizard).
	 *
	 * @param array<string,mixed> $settings Settings.
	 * @param \WP_Post|null       $page     Selected page.
	 */
	private function render_steps( array $settings, $page ): void {
		$tryon = $this->integrations->tryon()->status();
		$steps = array(
			array( (bool) $page, __( 'Create or choose the store page', 'aisleza-3d-virtual-store-for-woocommerce' ), '#aisleza-page' ),
			array( is_array( $settings['sections'] ), __( 'Pick the categories that become aisles, in order', 'aisleza-3d-virtual-store-for-woocommerce' ), '#aisleza-sections' ),
			array( '' !== (string) $settings['store_name'], __( 'Set the store name, accent and layout', 'aisleza-3d-virtual-store-for-woocommerce' ), '#aisleza-store' ),
			array( $page && 'publish' === $page->post_status && $settings['enabled'], __( 'Preview, then open the store to shoppers', 'aisleza-3d-virtual-store-for-woocommerce' ), '#aisleza-page' ),
			array( TryOnProvider::READY === ( $tryon['state'] ?? '' ), __( 'Optional: connect integrations', 'aisleza-3d-virtual-store-for-woocommerce' ), '#aisleza-integrations' ),
		);
		$done  = count( array_filter( array_column( $steps, 0 ) ) );
		echo '<div class="aisleza-admin__card aisleza-setup" id="aisleza-card-setup">';
		echo '<div class="aisleza-setup__head"><h2 id="aisleza-setup">' . esc_html__( 'Get started', 'aisleza-3d-virtual-store-for-woocommerce' ) . '</h2>';
		/* translators: 1: steps done, 2: all steps */
		echo '<span class="aisleza-setup__count">' . esc_html( sprintf( __( '%1$d of %2$d done', 'aisleza-3d-virtual-store-for-woocommerce' ), $done, count( $steps ) ) ) . '</span></div>';
		printf( '<div class="aisleza-setup__bar" role="progressbar" aria-valuemin="0" aria-valuemax="%1$d" aria-valuenow="%2$d" aria-label="%3$s"><span style="width:%4$d%%"></span></div>', count( $steps ), (int) $done, esc_attr__( 'Setup progress', 'aisleza-3d-virtual-store-for-woocommerce' ), (int) round( 100 * $done / count( $steps ) ) );
		echo '<ol class="aisleza-steps">';
		foreach ( $steps as $i => $step ) {
			printf(
				'<li class="%1$s"><span class="aisleza-steps__mark" aria-hidden="true">%2$s</span> <a href="%3$s">%4$s</a> <span class="screen-reader-text">%5$s</span></li>',
				esc_attr( $step[0] ? 'is-done' : 'is-todo' ),
				esc_html( $step[0] ? '✓' : (string) ( $i + 1 ) ),
				esc_url( $step[2] ),
				esc_html( $step[1] ),
				esc_html( $step[0] ? __( '(done)', 'aisleza-3d-virtual-store-for-woocommerce' ) : __( '(to do)', 'aisleza-3d-virtual-store-for-woocommerce' ) )
			);
		}
		echo '</ol></div>';
	}

	/**
	 * Result of the last action.
	 *
	 * @param string $notice Notice key.
	 */
	private function render_notice( string $notice ): void {
		$messages = array(
			'created' => array( 'success', __( 'A draft store page was created and selected. Preview it, then publish it when you are ready.', 'aisleza-3d-virtual-store-for-woocommerce' ) ),
			'exists'  => array( 'info', __( 'A store page is already selected, so no new page was created.', 'aisleza-3d-virtual-store-for-woocommerce' ) ),
			'failed'  => array( 'error', __( 'The store page could not be created. Please try again.', 'aisleza-3d-virtual-store-for-woocommerce' ) ),
			'saved'   => array( 'success', __( 'Virtual store settings saved.', 'aisleza-3d-virtual-store-for-woocommerce' ) ),
		);
		if ( isset( $messages[ $notice ] ) ) {
			printf( '<div class="notice notice-%1$s inline aisleza-admin-notice"><p>%2$s</p></div>', esc_attr( $messages[ $notice ][0] ), esc_html( $messages[ $notice ][1] ) );
		}
	}

	/**
	 * Store page status, preview/open links and the explicit "Create store page" action.
	 *
	 * @param array<string,mixed> $settings Settings.
	 * @param \WP_Post|null       $page     Selected page.
	 */
	private function render_page_box( array $settings, $page ): void {
		$shop = (string) wc_get_page_permalink( 'shop' );
		?>
		<h2 id="aisleza-page"><?php esc_html_e( 'Store page', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></h2>
		<?php if ( $page ) : ?>
			<p>
				<?php
				printf(
					/* translators: 1: page title, 2: status such as Published or Draft */
					esc_html__( 'Shoppers enter the store on “%1$s” (%2$s).', 'aisleza-3d-virtual-store-for-woocommerce' ),
					esc_html( get_the_title( $page ) ),
					esc_html( (string) get_post_status_object( (string) $page->post_status )->label )
				);
				?>
			</p>
			<p class="aisleza-admin-links">
				<a class="button" href="<?php echo esc_url( 'publish' === $page->post_status ? (string) get_permalink( $page ) : (string) get_preview_post_link( $page ) ); ?>" target="_blank" rel="noopener"><?php echo 'publish' === $page->post_status ? esc_html__( 'Open store', 'aisleza-3d-virtual-store-for-woocommerce' ) : esc_html__( 'Preview store', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></a>
				<a class="button" href="<?php echo esc_url( (string) get_edit_post_link( $page ) ); ?>"><?php echo 'publish' === $page->post_status ? esc_html__( 'Edit page', 'aisleza-3d-virtual-store-for-woocommerce' ) : esc_html__( 'Edit and publish page', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></a>
				<a class="button-link" href="<?php echo esc_url( $shop ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Regular shop', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></a>
			</p>
			<?php if ( ! $settings['enabled'] ) : ?>
				<p class="description"><?php esc_html_e( 'The store is switched off, so shoppers see a short “closed” message with a link to your shop. You can still preview it while logged in.', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></p>
			<?php endif; ?>
			<?php if ( 'theme' === $settings['layout'] && ! self::has_store_shortcode( (string) $page->post_content ) ) : ?>
				<p class="description aisleza-admin-warn">
					<?php
					echo wp_kses(
						sprintf(
							/* translators: %s: shortcode */
							esc_html__( 'This page does not contain %s yet. Add it to the page, or choose the “Full window” layout, which shows the store whatever the page contains.', 'aisleza-3d-virtual-store-for-woocommerce' ),
							'<code>[' . esc_html( Shortcode::TAG ) . ']</code>'
						),
						array( 'code' => array() )
					);
					?>
				</p>
			<?php endif; ?>
		<?php else : ?>
			<p><?php esc_html_e( 'No store page yet. Create one here (it starts as a draft you publish yourself), or put the shortcode on any page and select that page below.', 'aisleza-3d-virtual-store-for-woocommerce' ); ?> <code>[<?php echo esc_html( Shortcode::TAG ); ?>]</code></p>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="aisleza-admin-create">
				<input type="hidden" name="action" value="aisleza_create_page">
				<?php wp_nonce_field( self::NONCE_PAGE ); ?>
				<?php submit_button( __( 'Create virtual store page', 'aisleza-3d-virtual-store-for-woocommerce' ), 'secondary', 'submit', false ); ?>
			</form>
		<?php endif; ?>
		<?php
	}

	/**
	 * The settings form.
	 *
	 * @param array<string,mixed> $settings Settings.
	 * @param \WP_Post|null       $page     Selected page.
	 */
	private function render_form( array $settings, $page ): void {
		$pages = get_pages(
			array(
				'post_status' => array( 'publish', 'draft', 'private' ),
				'sort_column' => 'post_title',
				'number'      => 300,
			)
		);
		$rows  = $this->sections->rows( $settings );
		$order = array();
		foreach ( $rows as $i => $row ) {
			$order[ (int) $row['id'] ] = array( $i + 1, $row );
		}
		$terms = $this->sections->all_for_admin();
		$known = wp_list_pluck( $terms, 'id' );
		?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="aisleza-admin-form">
			<input type="hidden" name="action" value="aisleza_save">
			<?php wp_nonce_field( self::NONCE_SAVE ); ?>

			<div class="aisleza-tab" id="aisleza-tab-store" data-tab-label="<?php esc_attr_e( 'Store', 'aisleza-3d-virtual-store-for-woocommerce' ); ?>">
			<h2 id="aisleza-store"><?php esc_html_e( 'Store', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Virtual store', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></th>
					<td><label><input type="checkbox" name="enabled" value="1" <?php checked( (bool) $settings['enabled'] ); ?>> <?php esc_html_e( 'Open the virtual store to shoppers', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label></td>
				</tr>
				<tr>
					<th scope="row"><label for="aisleza-page"><?php esc_html_e( 'Store page', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label></th>
					<td>
						<select id="aisleza-page" name="page_id">
							<option value="0"><?php esc_html_e( '— Choose a page —', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></option>
							<?php foreach ( (array) $pages as $option ) : ?>
								<option value="<?php echo esc_attr( (string) $option->ID ); ?>" <?php selected( $page ? (int) $page->ID : 0, (int) $option->ID ); ?>>
									<?php echo esc_html( get_the_title( $option ) . ( 'publish' !== $option->post_status ? ' (' . get_post_status_object( (string) $option->post_status )->label . ')' : '' ) ); ?>
								</option>
							<?php endforeach; ?>
						</select>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Layout', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></th>
					<td>
						<fieldset>
							<label><input type="radio" name="layout" value="full" <?php checked( 'full', $settings['layout'] ); ?>> <?php esc_html_e( 'Full window (recommended): the store page shows only the store, with a link back to your shop', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label><br>
							<label><input type="radio" name="layout" value="theme" <?php checked( 'theme', $settings['layout'] ); ?>> <?php esc_html_e( 'Inside my theme: the store sits in the page content with your header and footer', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label>
						</fieldset>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Store size', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></th>
					<td>
						<fieldset>
							<label><input type="radio" name="open_size" value="page" <?php checked( 'page', $settings['open_size'] ); ?>> <?php esc_html_e( 'Open in its place on the page', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label><br>
							<label><input type="radio" name="open_size" value="window" <?php checked( 'window', $settings['open_size'] ); ?>> <?php esc_html_e( 'Fill the browser window when shoppers walk in', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label>
						</fieldset>
						<p class="description"><?php esc_html_e( 'Shoppers can always switch with the buttons at the top of the store: fill the window, or full screen on devices that allow it. With the Full window layout the store already fills the window.', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Store view', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></th>
					<td>
						<fieldset>
							<label><input type="radio" name="view" value="3d" <?php checked( '3d', $settings['view'] ); ?>> <?php esc_html_e( 'Walk-in 3D store (recommended): shoppers walk the aisles with the keyboard, mouse or an on-screen joystick', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label><br>
							<label><input type="radio" name="view" value="shelves" <?php checked( 'shelves', $settings['view'] ); ?>> <?php esc_html_e( 'Shelf wall: one aisle at a time on a flat shelf (lighter, for older devices)', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label>
						</fieldset>
						<p class="description"><?php esc_html_e( 'Browsers without 3D support always get the shelf wall, and every shopper can switch to a plain list.', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="aisleza-name"><?php esc_html_e( 'Store name', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label></th>
					<td><input type="text" id="aisleza-name" name="store_name" class="regular-text" maxlength="80" value="<?php echo esc_attr( (string) $settings['store_name'] ); ?>" placeholder="<?php echo esc_attr( wp_specialchars_decode( (string) get_bloginfo( 'name' ), ENT_QUOTES ) ); ?>"></td>
				</tr>
				<tr>
					<th scope="row"><label for="aisleza-accent"><?php esc_html_e( 'Brand accent', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label></th>
					<td>
						<input type="color" id="aisleza-accent" name="accent" value="<?php echo esc_attr( (string) $settings['accent'] ); ?>">
						<p class="description"><?php esc_html_e( 'Used for the shop front, signs and buttons. Text and fonts follow your site.', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></p>
					</td>
				</tr>
			</table>

			</div>
			<div class="aisleza-tab" id="aisleza-tab-aisles" data-tab-label="<?php esc_attr_e( 'Aisles', 'aisleza-3d-virtual-store-for-woocommerce' ); ?>">
			<h2 id="aisleza-sections"><?php esc_html_e( 'Aisles', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></h2>
			<p class="description"><?php esc_html_e( 'Each ticked category becomes an aisle, in the order of the position numbers. Sub-categories of an aisle appear as filters inside it. Products stay in their real categories, so a product in two ticked categories is on both aisles.', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></p>
			<table class="widefat striped aisleza-sections">
				<thead>
					<tr>
						<th scope="col"><?php esc_html_e( 'Aisle', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Category', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Position', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Sign label', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Sign colour', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></th>
						<th scope="col"><?php esc_html_e( 'Category image on sign', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php if ( ! $terms ) : ?>
						<tr><td colspan="6"><?php esc_html_e( 'No product categories yet. Add categories under Products → Categories.', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></td></tr>
					<?php endif; ?>
					<?php foreach ( $terms as $term ) : ?>
						<?php
						$id       = (int) $term['id'];
						$included = isset( $order[ $id ] );
						$row      = $included ? $order[ $id ][1] : array(
							'label'  => '',
							'accent' => '',
							'image'  => false,
						);
						$field    = 'sections[' . $id . ']';
						?>
						<tr class="<?php echo esc_attr( $term['depth'] ? 'aisleza-sections__child' : '' ); ?>">
							<td><input type="checkbox" id="aisleza-s-<?php echo esc_attr( (string) $id ); ?>" name="<?php echo esc_attr( $field ); ?>[include]" value="1" <?php checked( $included ); ?>></td>
							<td>
								<label for="aisleza-s-<?php echo esc_attr( (string) $id ); ?>"><?php echo esc_html( ( $term['depth'] ? '— ' : '' ) . $term['name'] ); ?></label>
								<span class="aisleza-sections__count">
									<?php
									/* translators: %d: number of products */
									echo esc_html( sprintf( _n( '%d product', '%d products', (int) $term['count'], 'aisleza-3d-virtual-store-for-woocommerce' ), (int) $term['count'] ) );
									?>
								</span>
							</td>
							<td><input type="number" class="small-text" min="1" max="99" name="<?php echo esc_attr( $field ); ?>[position]" value="<?php echo esc_attr( (string) ( $included ? $order[ $id ][0] : '' ) ); ?>" aria-label="<?php echo esc_attr( sprintf( /* translators: %s: category */ __( 'Position of %s', 'aisleza-3d-virtual-store-for-woocommerce' ), $term['name'] ) ); ?>"></td>
							<td><input type="text" class="regular-text" maxlength="60" name="<?php echo esc_attr( $field ); ?>[label]" value="<?php echo esc_attr( (string) $row['label'] ); ?>" placeholder="<?php echo esc_attr( $term['name'] ); ?>" aria-label="<?php echo esc_attr( sprintf( /* translators: %s: category */ __( 'Sign label for %s', 'aisleza-3d-virtual-store-for-woocommerce' ), $term['name'] ) ); ?>"></td>
							<td><input type="text" class="aisleza-hex" maxlength="7" pattern="#[0-9a-fA-F]{6}" name="<?php echo esc_attr( $field ); ?>[accent]" value="<?php echo esc_attr( (string) $row['accent'] ); ?>" placeholder="<?php esc_attr_e( 'Brand accent', 'aisleza-3d-virtual-store-for-woocommerce' ); ?>" aria-label="<?php echo esc_attr( sprintf( /* translators: %s: category */ __( 'Sign colour for %s, like #1b2440', 'aisleza-3d-virtual-store-for-woocommerce' ), $term['name'] ) ); ?>"></td>
							<td><input type="checkbox" name="<?php echo esc_attr( $field ); ?>[image]" value="1" <?php checked( ! empty( $row['image'] ) ); ?> <?php disabled( '' === $term['image'] ); ?> aria-label="<?php echo esc_attr( sprintf( /* translators: %s: category */ __( 'Show the image of %s on its sign', 'aisleza-3d-virtual-store-for-woocommerce' ), $term['name'] ) ); ?>"></td>
						</tr>
					<?php endforeach; ?>
					<?php foreach ( $rows as $row ) : ?>
						<?php if ( ! in_array( (int) $row['id'], $known, true ) ) : ?>
							<tr class="aisleza-sections__missing"><td colspan="6">
								<?php
								/* translators: %d: category id */
								echo esc_html( sprintf( __( 'Category #%d no longer exists, so its aisle is hidden. Save to remove it from the list.', 'aisleza-3d-virtual-store-for-woocommerce' ), (int) $row['id'] ) );
								?>
							</td></tr>
						<?php endif; ?>
					<?php endforeach; ?>
				</tbody>
			</table>

			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="aisleza-per-shelf"><?php esc_html_e( 'Products per shelf', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label></th>
					<td>
						<input type="number" id="aisleza-per-shelf" class="small-text" name="per_shelf" min="<?php echo esc_attr( (string) Settings::MIN_PER_SHELF ); ?>" max="<?php echo esc_attr( (string) Settings::MAX_PER_SHELF ); ?>" value="<?php echo esc_attr( (string) $settings['per_shelf'] ); ?>">
						<p class="description"><?php esc_html_e( 'Shoppers see this many products at a time and move to the next shelf for more. Only the shelf being viewed is loaded.', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Aisles', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></th>
					<td>
						<label><input type="checkbox" name="child_filters" value="1" <?php checked( (bool) $settings['child_filters'] ); ?>> <?php esc_html_e( 'Show sub-categories as filters inside an aisle', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label><br>
						<label><input type="checkbox" name="show_empty" value="1" <?php checked( (bool) $settings['show_empty'] ); ?>> <?php esc_html_e( 'Show aisles that have no products', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Ways in', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></th>
					<td>
						<fieldset>
							<label><input type="radio" name="entry_link" value="none" <?php checked( 'none', $settings['entry_link'] ); ?>> <?php esc_html_e( 'Only links I add myself', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label><br>
							<label><input type="radio" name="entry_link" value="shop_banner" <?php checked( 'shop_banner', $settings['entry_link'] ); ?>> <?php esc_html_e( 'Also show an “Enter the virtual store” banner above the shop and category grids', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></label>
						</fieldset>
						<p class="description">
							<?php
							echo wp_kses(
								sprintf(
									/* translators: %s: shortcode */
									esc_html__( 'Menus are never changed. Add the store page to a menu yourself, or place %s on any page or widget.', 'aisleza-3d-virtual-store-for-woocommerce' ),
									'<code>[' . esc_html( EntryLink::TAG ) . ']</code>'
								),
								array( 'code' => array() )
							);
							?>
						</p>
					</td>
				</tr>
			</table>
			</div>
			<p class="aisleza-admin__actions"><?php submit_button( __( 'Save changes', 'aisleza-3d-virtual-store-for-woocommerce' ), 'primary', 'submit', false ); ?></p>
		</form>
		<?php
	}

	/**
	 * Optional integrations, with honest status and the next step. Never installs anything or nags.
	 */
	private function render_integrations(): void {
		?>
		<h2><?php esc_html_e( 'Integrations (optional)', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></h2>
		<p class="description"><?php esc_html_e( 'Your virtual store works fully without any integration.', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></p>
		<?php foreach ( $this->integrations->all() as $integration ) : ?>
			<?php $status = $integration->status(); ?>
			<div class="aisleza-integration aisleza-integration--<?php echo esc_attr( $status['state'] ); ?>">
				<h3><?php echo esc_html( $status['title'] ); ?></h3>
				<?php if ( 'weargraph' === $integration->id() ) : ?>
					<p><?php esc_html_e( 'Let shoppers preview supported wearable products on their own photos. Optional: your virtual store works fully without WearGraph.', 'aisleza-3d-virtual-store-for-woocommerce' ); ?></p>
				<?php endif; ?>
				<p class="aisleza-integration__status"><strong><?php echo esc_html( self::state_label( $status['state'] ) ); ?></strong> — <?php echo esc_html( $status['message'] ); ?></p>
				<?php if ( '' !== $status['action_url'] ) : ?>
					<p><a class="button" href="<?php echo esc_url( $status['action_url'] ); ?>"><?php echo esc_html( $status['action_label'] ); ?></a></p>
				<?php endif; ?>
			</div>
		<?php endforeach; ?>
		<?php
	}

	/**
	 * The page contains the store shortcode.
	 *
	 * @param string $content Page content.
	 */
	private static function has_store_shortcode( string $content ): bool {
		return has_shortcode( $content, Shortcode::TAG );
	}

	/**
	 * Human label for an integration state.
	 *
	 * @param string $state State.
	 */
	private static function state_label( string $state ): string {
		$labels = array(
			TryOnProvider::ABSENT       => __( 'Not installed', 'aisleza-3d-virtual-store-for-woocommerce' ),
			TryOnProvider::INACTIVE     => __( 'Inactive', 'aisleza-3d-virtual-store-for-woocommerce' ),
			TryOnProvider::INCOMPATIBLE => __( 'Needs an update', 'aisleza-3d-virtual-store-for-woocommerce' ),
			TryOnProvider::UNCONFIGURED => __( 'Needs setup', 'aisleza-3d-virtual-store-for-woocommerce' ),
			TryOnProvider::READY        => __( 'Active', 'aisleza-3d-virtual-store-for-woocommerce' ),
		);

		return $labels[ $state ] ?? $state;
	}

	/**
	 * Admin-post: save.
	 */
	public function save(): void {
		if ( ! current_user_can( self::capability() ) ) {
			wp_die( esc_html__( 'You are not allowed to change the virtual store settings.', 'aisleza-3d-virtual-store-for-woocommerce' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::NONCE_SAVE );

		$page_id = isset( $_POST['page_id'] ) ? absint( $_POST['page_id'] ) : 0;
		if ( $page_id && 'page' !== get_post_type( $page_id ) ) {
			$page_id = 0;
		}
		$raw_sections = isset( $_POST['sections'] ) && is_array( $_POST['sections'] ) ? map_deep( wp_unslash( $_POST['sections'] ), 'sanitize_text_field' ) : array();

		Settings::update(
			array(
				'enabled'       => ! empty( $_POST['enabled'] ),
				'page_id'       => $page_id,
				'layout'        => isset( $_POST['layout'] ) ? sanitize_key( wp_unslash( $_POST['layout'] ) ) : 'full',
				'view'          => isset( $_POST['view'] ) ? sanitize_key( wp_unslash( $_POST['view'] ) ) : '3d',
				'store_name'    => isset( $_POST['store_name'] ) ? sanitize_text_field( wp_unslash( $_POST['store_name'] ) ) : '',
				'accent'        => isset( $_POST['accent'] ) ? sanitize_hex_color( wp_unslash( $_POST['accent'] ) ) : '',
				'per_shelf'     => isset( $_POST['per_shelf'] ) ? absint( $_POST['per_shelf'] ) : 12,
				'child_filters' => ! empty( $_POST['child_filters'] ),
				'show_empty'    => ! empty( $_POST['show_empty'] ),
				'entry_link'    => isset( $_POST['entry_link'] ) ? sanitize_key( wp_unslash( $_POST['entry_link'] ) ) : 'none',
				'open_size'     => isset( $_POST['open_size'] ) ? sanitize_key( wp_unslash( $_POST['open_size'] ) ) : 'page',
				'sections'      => self::posted_sections( $raw_sections ),
			)
		);

		wp_safe_redirect( self::back( 'saved' ) );
		exit;
	}

	/**
	 * Turn the posted table into ordered section rows: ticked rows only, sorted by position
	 * (blank positions go last, in table order).
	 *
	 * @param array<int|string,mixed> $posted sections[term_id][include|position|label|accent|image].
	 * @return array<int,array{id:int,label:string,accent:string,image:bool}>
	 */
	public static function posted_sections( array $posted ): array {
		$rows  = array();
		$index = 0;
		foreach ( $posted as $id => $row ) {
			++$index;
			if ( ! is_array( $row ) || empty( $row['include'] ) || ! absint( $id ) ) {
				continue;
			}
			$position = isset( $row['position'] ) && '' !== $row['position'] ? absint( $row['position'] ) : 1000;
			$rows[]   = array(
				'sort'   => array( $position, $index ),
				'id'     => absint( $id ),
				'label'  => (string) ( $row['label'] ?? '' ),
				'accent' => (string) ( $row['accent'] ?? '' ),
				'image'  => ! empty( $row['image'] ),
			);
		}
		usort(
			$rows,
			static function ( $a, $b ) {
				return $a['sort'] <=> $b['sort'];
			}
		);

		return Settings::sections(
			array_map(
				static function ( $row ) {
					unset( $row['sort'] );
					return $row;
				},
				$rows
			)
		);
	}

	/**
	 * Admin-post: create a draft store page with the shortcode, only when asked.
	 */
	public function create_page(): void {
		if ( ! current_user_can( self::capability() ) || ! current_user_can( 'edit_pages' ) ) {
			wp_die( esc_html__( 'You are not allowed to create the store page.', 'aisleza-3d-virtual-store-for-woocommerce' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( self::NONCE_PAGE );

		$current = (int) Settings::get( 'page_id' );
		if ( $current && 'page' === get_post_type( $current ) && 'trash' !== get_post_status( $current ) ) {
			wp_safe_redirect( self::back( 'exists' ) );
			exit;
		}

		$page_id = wp_insert_post(
			array(
				'post_type'    => 'page',
				'post_status'  => 'draft',
				'post_title'   => __( 'Virtual Store', 'aisleza-3d-virtual-store-for-woocommerce' ),
				'post_content' => '<!-- wp:shortcode -->[' . Shortcode::TAG . ']<!-- /wp:shortcode -->',
			),
			true
		);
		if ( is_wp_error( $page_id ) || ! $page_id ) {
			wp_safe_redirect( self::back( 'failed' ) );
			exit;
		}
		Settings::update( array( 'page_id' => (int) $page_id ) );

		wp_safe_redirect( self::back( 'created' ) );
		exit;
	}
}
