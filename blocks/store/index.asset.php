<?php
/**
 * Dependencies of the block's editor script (index.js is hand-written, no build step).
 *
 * @package Aisleza
 */

defined( 'ABSPATH' ) || exit;

return array(
	'dependencies' => array( 'wp-blocks', 'wp-block-editor', 'wp-element', 'wp-i18n' ),
	'version'      => (string) filemtime( __DIR__ . '/index.js' ),
);
