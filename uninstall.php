<?php
/**
 * Uninstall: remove the add-on's settings. The store page is the merchant's content and stays.
 *
 * @package Aisleza
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'aisleza_settings' );
delete_option( 'aisleza_migration' ); // Written by pre-release builds only; removed if present.
