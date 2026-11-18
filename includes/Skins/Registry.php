<?php
/**
 * Which skin the store wears.
 *
 * @package Aisleza
 */

namespace Aisleza\Skins;

defined( 'ABSPATH' ) || exit;

/**
 * The free plugin has one skin, Boutique, for the whole store (D15). Add-ons may offer more
 * through the `aisleza_skins` filter and pick one with `aisleza_active_skin`; both are
 * extension points only: Boutique can't be removed or replaced, every added skin is checked
 * with Schema (data only), and anything invalid falls back to Boutique.
 */
final class Registry {

	/**
	 * The built-in skin.
	 */
	public const DEFAULT = 'boutique';

	/**
	 * Problems found in added skins, by skin id (for the add-on that offered them).
	 *
	 * @var array<string,string[]>
	 */
	private static $problems = array();

	/**
	 * Every usable skin: id => array( 'name' => string, 'data' => array|null ). Boutique's data
	 * is null: the engine has it built in, so nothing extra is sent to the page.
	 *
	 * @return array<string,array{name:string,data:array<string,mixed>|null}>
	 */
	public static function all(): array {
		$skins          = array(
			self::DEFAULT => array(
				'name' => 'Boutique', // The skin's name; not translated.
				'data' => null,
			),
		);
		self::$problems = array();

		/**
		 * Skins offered by add-ons.
		 *
		 * Each entry is id => array( 'data' => decoded skin.json ). Decode with objects as
		 * stdClass (json_decode without the associative flag, or wp_json_file_decode). Skins are
		 * data only; they are validated against the skin schema, and invalid parts are dropped.
		 *
		 * @param array<string,array{data:mixed}> $skins Added skins (Boutique is not in this list).
		 */
		$added = apply_filters( 'aisleza_skins', array() );
		if ( ! is_array( $added ) ) {
			return $skins;
		}
		foreach ( $added as $id => $entry ) {
			$id = (string) $id;
			if ( self::DEFAULT === $id || ! preg_match( '/^[a-z0-9-]{1,40}$/D', $id ) ) {
				self::$problems[ $id ] = array( 'id: invalid or reserved' );
				continue;
			}
			$data = is_array( $entry ) && array_key_exists( 'data', $entry ) ? $entry['data'] : null;
			if ( is_array( $data ) ) {
				$data = json_decode( (string) wp_json_encode( $data ) ); // Same shape as a decoded file.
			}
			$checked = Schema::validate( $data );
			if ( $checked['errors'] ) {
				self::$problems[ $id ] = $checked['errors'];
			}
			if ( null === $checked['skin'] ) {
				continue;
			}
			$skins[ $id ] = array(
				'name' => isset( $checked['skin']['name'] ) ? (string) $checked['skin']['name'] : $id,
				'data' => $checked['skin'],
			);
		}
		return $skins;
	}

	/**
	 * The skin the store wears now, with its id.
	 *
	 * @return array{id:string,name:string,data:array<string,mixed>|null}
	 */
	public static function active(): array {
		$skins = self::all();

		/**
		 * The id of the skin the store should wear. Unknown ids fall back to Boutique.
		 *
		 * @param string $id Skin id.
		 */
		$id = apply_filters( 'aisleza_active_skin', self::DEFAULT );
		$id = is_string( $id ) && isset( $skins[ $id ] ) ? $id : self::DEFAULT;
		return array( 'id' => $id ) + $skins[ $id ];
	}

	/**
	 * What was wrong with the skins add-ons offered in the last all() call.
	 *
	 * @return array<string,string[]>
	 */
	public static function problems(): array {
		return self::$problems;
	}
}
