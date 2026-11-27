<?php
/**
 * The "Aisleza 3D Store" block: the same store as the [aisleza] shortcode, for the block editor.
 *
 * @package Aisleza
 */

namespace Aisleza\Frontend;

defined( 'ABSPATH' ) || exit;

/**
 * Registers blocks/store. The block renders by running the [aisleza] shortcode, so every shortcode
 * filter (pre_do_shortcode_tag, do_shortcode_tag) and add-on keeps working the same in both.
 */
final class Block {

	public const NAME = 'aisleza/store';

	/**
	 * Register hooks.
	 */
	public function boot(): void {
		if ( did_action( 'init' ) ) {
			$this->register();
			return;
		}
		add_action( 'init', array( $this, 'register' ) );
	}

	/**
	 * Register the block and its editor translations.
	 */
	public function register(): void {
		if ( ! function_exists( 'register_block_type' ) ) {
			return;
		}
		$type = register_block_type(
			AISLEZA_DIR . 'blocks/store',
			array( 'render_callback' => array( self::class, 'render' ) )
		);
		if ( $type && ! empty( $type->editor_script_handles ) ) {
			foreach ( $type->editor_script_handles as $handle ) {
				wp_set_script_translations( $handle, 'aisleza-3d-virtual-store-for-woocommerce', AISLEZA_DIR . 'languages' );
			}
		}
	}

	/**
	 * The block's front end: the store, exactly as the shortcode draws it.
	 */
	public static function render(): string {
		return do_shortcode( '[' . Shortcode::TAG . ']' );
	}

	/**
	 * Whether content holds the store (the block or the shortcode).
	 *
	 * @param string $content Post content.
	 */
	public static function in_content( string $content ): bool {
		return has_shortcode( $content, Shortcode::TAG ) || ( function_exists( 'has_block' ) && has_block( self::NAME, $content ) );
	}
}
