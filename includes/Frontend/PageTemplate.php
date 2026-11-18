<?php
/**
 * Full-window layout for the configured store page only.
 *
 * @package Aisleza
 */

namespace Aisleza\Frontend;

defined( 'ABSPATH' ) || exit;

use Aisleza\Settings;

/**
 * When the merchant picks "Full window", the store page uses the add-on's own minimal
 * template (still with wp_head/wp_footer, so analytics, consent banners and the admin bar
 * keep working). Every other page, and the store page in "Inside my theme" mode, is left to
 * the theme.
 */
final class PageTemplate {

	/**
	 * Register hooks.
	 */
	public function boot(): void {
		add_filter( 'template_include', array( $this, 'template' ), 99 );
		add_filter( 'body_class', array( $this, 'body_class' ) );
	}

	/**
	 * Is the current request the configured store page?
	 */
	public static function is_store_page(): bool {
		$page_id = (int) Settings::get( 'page_id' );

		return $page_id > 0 && is_page( $page_id );
	}

	/**
	 * Whether this request gets the full-window template.
	 */
	public static function active(): bool {
		return 'full' === Settings::get( 'layout' ) && self::is_store_page() && Shortcode::open_for_viewer() && ! post_password_required();
	}

	/**
	 * Swap the template.
	 *
	 * @param string $template Template path.
	 */
	public function template( $template ) {
		return self::active() ? AISLEZA_DIR . 'templates/store-page.php' : $template;
	}

	/**
	 * Body class for the store page.
	 *
	 * @param string[] $classes Classes.
	 * @return string[]
	 */
	public function body_class( $classes ) {
		if ( self::active() ) {
			$classes[] = 'aisleza-fullwindow';
		}

		return $classes;
	}
}
