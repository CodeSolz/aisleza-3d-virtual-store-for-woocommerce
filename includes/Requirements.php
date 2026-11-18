<?php
/**
 * Dependency check: WooCommerce only.
 *
 * @package Aisleza
 */

namespace Aisleza;

defined( 'ABSPATH' ) || exit;

/**
 * Never fatal: a missing or outdated WooCommerce becomes one admin notice that says what to do.
 * Optional integrations (WearGraph try-on) are not requirements; see Integrations\Registry.
 */
final class Requirements {

	/**
	 * Problems found, as translated sentences. Empty when everything is in place.
	 *
	 * @return string[]
	 */
	public static function problems(): array {
		if ( ! defined( 'WC_VERSION' ) || ! function_exists( 'WC' ) ) {
			return array(
				sprintf(
					/* translators: %s: product name */
					__( '%s needs WooCommerce. Install and activate WooCommerce, then reload this page.', 'aisleza-3d-virtual-store-for-woocommerce' ),
					Brand::name()
				),
			);
		}
		if ( version_compare( WC_VERSION, AISLEZA_MIN_WC, '<' ) ) {
			return array(
				sprintf(
					/* translators: 1: product name, 2: required WooCommerce version, 3: installed version */
					__( '%1$s needs WooCommerce %2$s or newer (you have %3$s). Update WooCommerce under Plugins.', 'aisleza-3d-virtual-store-for-woocommerce' ),
					Brand::name(),
					AISLEZA_MIN_WC,
					WC_VERSION
				),
			);
		}

		return array();
	}

	/**
	 * Show the problems on admin screens to people who can fix them.
	 *
	 * @param string[] $problems Problems.
	 */
	public static function notice( array $problems ): void {
		add_action(
			'admin_notices',
			static function () use ( $problems ) {
				// Only on the Plugins screen and the Dashboard, to people who can fix it.
				$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
				if ( ! current_user_can( 'activate_plugins' ) || ! $screen || ! in_array( $screen->id, array( 'plugins', 'plugins-network', 'dashboard' ), true ) ) {
					return;
				}
				foreach ( $problems as $problem ) {
					printf( '<div class="notice notice-error"><p>%s</p></div>', esc_html( $problem ) );
				}
			}
		);
	}
}
