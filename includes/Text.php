<?php
/**
 * Text helpers that don't depend on optional PHP extensions.
 *
 * @package Aisleza
 */

namespace Aisleza;

defined( 'ABSPATH' ) || exit;

/**
 * The mbstring extension is optional in PHP, so text is shortened without relying on it.
 */
final class Text {

	/**
	 * The first $length characters of a string, never cutting a multi-byte character in half.
	 * Uses mbstring when the server has it; otherwise PCRE's UTF-8 mode, then a byte cut as a last resort.
	 *
	 * @param string $text   Text to shorten.
	 * @param int    $length Maximum number of characters.
	 * @return string
	 */
	public static function limit( $text, $length ) {
		$text   = (string) $text;
		$length = max( 0, (int) $length );
		if ( function_exists( 'mb_substr' ) ) {
			return mb_substr( $text, 0, $length, 'UTF-8' );
		}
		if ( 1 === preg_match( '/^.{0,' . $length . '}/su', $text, $match ) ) {
			return $match[0];
		}
		return substr( $text, 0, $length );
	}
}
