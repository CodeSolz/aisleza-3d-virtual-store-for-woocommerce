<?php
/**
 * Skin validation: the PHP twin of src/world/schema.js.
 *
 * @package Aisleza
 */

namespace Aisleza\Skins;

defined( 'ABSPATH' ) || exit;

/**
 * A skin is data only (never code). The allowed shape is the Boutique skin itself: a skin may
 * only use keys Boutique has, and each value must have the same kind as Boutique's (colour,
 * number, switch, name, list). Numbers are clamped to safe ranges, unknown keys and broken
 * values are dropped (Boutique's value then applies), and a skin made for a newer engine is
 * refused as a whole.
 *
 * Keep the rule tables identical to src/world/schema.js; tests/fixtures/skin-cases.json runs
 * against both. Input is JSON decoded with objects as stdClass (json_decode without the
 * associative flag, or wp_json_file_decode), so groups and lists stay distinguishable.
 */
final class Schema {

	/**
	 * Skin format version this engine understands.
	 */
	public const ENGINE = 1;

	private const HEX = '/^#[0-9a-f]{6}$/iD';

	private const NAME = '/^[a-z0-9-]{1,32}$/D';

	/**
	 * Fixed word lists.
	 */
	private const ENUMS = array(
		'fonts.signs' => array( 'serif', 'sans' ),
	);

	/**
	 * Lists of fixed words (order kept, duplicates removed).
	 */
	private const ENUM_LISTS = array(
		'shelfDecor.sets' => array( 'vases', 'plant', 'towels', 'basket', 'candles' ),
	);

	/**
	 * Colour lists: array( minimum, maximum ) entries.
	 */
	private const COLOUR_LISTS = array(
		'floor.tones'   => array( 1, 4 ),
		'floor.clouds'  => array( 2, 2 ),
		'floor.speckle' => array( 1, 8 ),
		'plants.greens' => array( 1, 12 ),
		'plants.olive'  => array( 2, 2 ),
		'outside.trees' => array( 1, 6 ),
	);

	/**
	 * Numbers: array( minimum, maximum ).
	 */
	private const RANGES = array(
		'glow.intensity'            => array( 0, 2 ),
		'floor.tile'                => array( 0.3, 3 ),
		'floor.roughness'           => array( 0, 1 ),
		'lighting.fogNear'          => array( 1, 200 ),
		'lighting.fogFar'           => array( 5, 400 ),
		'lighting.exposure'         => array( 0.3, 2 ),
		'lighting.environment'      => array( 0, 2 ),
		'lighting.hemisphere'       => array( 0, 4 ),
		'lighting.ambientIntensity' => array( 0, 3 ),
		'lighting.sunIntensity'     => array( 0, 4 ),
	);

	/**
	 * The built-in Boutique skin (the template every skin is checked against).
	 *
	 * @return \stdClass
	 */
	public static function boutique(): \stdClass {
		static $boutique = null;
		if ( null === $boutique ) {
			$decoded  = wp_json_file_decode( AISLEZA_DIR . 'skins/boutique/skin.json' );
			$boutique = $decoded instanceof \stdClass ? $decoded : new \stdClass();
		}
		return $boutique;
	}

	/**
	 * Check a skin.
	 *
	 * @param mixed          $raw      Decoded skin (objects as stdClass).
	 * @param \stdClass|null $template Template; Boutique by default.
	 * @return array{skin: array<string,mixed>|null, errors: string[]} skin holds only the valid
	 *         parts (merge it onto Boutique), or null when the skin can't be used at all.
	 */
	public static function validate( $raw, ?\stdClass $template = null ): array {
		$template = $template ?? self::boutique();
		if ( ! $raw instanceof \stdClass ) {
			return array(
				'skin'   => null,
				'errors' => array( 'skin: not an object' ),
			);
		}
		$fields = get_object_vars( $raw );
		if ( isset( $fields['engine'] ) && is_int( $fields['engine'] ) && $fields['engine'] > self::ENGINE ) {
			return array(
				'skin'   => null,
				'errors' => array( 'engine: needs engine ' . $fields['engine'] . ', this is ' . self::ENGINE ),
			);
		}

		$errors = array();
		$skin   = array();
		$base   = get_object_vars( $template );
		foreach ( $fields as $key => $value ) {
			$key = (string) $key;
			if ( in_array( $key, array( 'id', 'name', 'version', 'engine' ), true ) ) {
				$clean = self::identity( $key, $value );
				if ( null === $clean ) {
					$errors[] = $key . ': invalid';
				} else {
					$skin[ $key ] = $clean;
				}
				continue;
			}
			if ( ! array_key_exists( $key, $base ) ) {
				$errors[] = $key . ': unknown key';
				continue;
			}
			$clean = self::check( $value, $base[ $key ], $key, $errors );
			if ( null !== $clean ) {
				$skin[ $key ] = $clean;
			}
		}

		// Fog must end after it starts; otherwise keep Boutique's fog.
		if ( isset( $skin['lighting'] ) && ( isset( $skin['lighting']['fogNear'] ) || isset( $skin['lighting']['fogFar'] ) ) ) {
			$near = $skin['lighting']['fogNear'] ?? $template->lighting->fogNear;
			$far  = $skin['lighting']['fogFar'] ?? $template->lighting->fogFar;
			if ( $far <= $near ) {
				unset( $skin['lighting']['fogNear'], $skin['lighting']['fogFar'] );
				$errors[] = 'lighting.fogFar: must be greater than fogNear';
				if ( ! $skin['lighting'] ) {
					unset( $skin['lighting'] );
				}
			}
		}

		return array(
			'skin'   => $skin,
			'errors' => $errors,
		);
	}

	/**
	 * The top-level identity fields, each with its own rule. null = invalid.
	 *
	 * @param string $key   Field.
	 * @param mixed  $value Value.
	 * @return string|int|null
	 */
	private static function identity( string $key, $value ) {
		switch ( $key ) {
			case 'id':
				return is_string( $value ) && preg_match( '/^[a-z0-9-]{1,40}$/D', $value ) ? $value : null;
			case 'name':
				if ( ! is_string( $value ) ) {
					return null;
				}
				$name = trim( (string) preg_replace( '/[\x00-\x1f<>]/', '', $value ) );
				$name = \Aisleza\Text::limit( $name, 60 );
				return '' === $name ? null : $name;
			case 'version':
				return is_string( $value ) && preg_match( '/^\d{1,4}\.\d{1,4}\.\d{1,4}$/D', $value ) ? $value : null;
			default: // engine.
				return is_int( $value ) && $value >= 1 ? $value : null;
		}
	}

	/**
	 * One value against the template value at the same path. null = drop it.
	 *
	 * @param mixed    $value    Value from the skin.
	 * @param mixed    $template Boutique's value at this path.
	 * @param string   $path     Dotted path, for the rule tables and messages.
	 * @param string[] $errors   Collected messages.
	 * @return mixed
	 */
	private static function check( $value, $template, string $path, array &$errors ) {
		if ( $template instanceof \stdClass ) {
			if ( ! $value instanceof \stdClass ) {
				$errors[] = $path . ': expected a group of settings';
				return null;
			}
			$base = get_object_vars( $template );
			$out  = array();
			foreach ( get_object_vars( $value ) as $key => $item ) {
				$key = (string) $key;
				if ( ! array_key_exists( $key, $base ) ) {
					$errors[] = $path . '.' . $key . ': unknown key';
					continue;
				}
				$clean = self::check( $item, $base[ $key ], $path . '.' . $key, $errors );
				if ( null !== $clean ) {
					$out[ $key ] = $clean;
				}
			}
			return $out ? $out : null; // An empty group carries nothing (and would encode as a JSON list).
		}

		if ( isset( self::ENUM_LISTS[ $path ] ) ) {
			if ( ! is_array( $value ) ) {
				$errors[] = $path . ': expected a list';
				return null;
			}
			$out = array();
			foreach ( $value as $item ) {
				if ( is_string( $item ) && in_array( $item, self::ENUM_LISTS[ $path ], true ) && ! in_array( $item, $out, true ) ) {
					$out[] = $item;
				} else {
					$errors[] = $path . ': dropped "' . substr( is_scalar( $item ) ? (string) $item : gettype( $item ), 0, 32 ) . '"';
				}
			}
			return $out; // An empty list is allowed: no shelf decor.
		}

		if ( isset( self::COLOUR_LISTS[ $path ] ) ) {
			if ( ! is_array( $value ) ) {
				$errors[] = $path . ': expected a list of colours';
				return null;
			}
			list( $min, $max ) = self::COLOUR_LISTS[ $path ];
			$out               = array();
			foreach ( $value as $colour ) {
				if ( is_string( $colour ) && preg_match( self::HEX, $colour ) ) {
					$out[] = strtolower( $colour );
				}
			}
			$out = array_slice( $out, 0, $max );
			if ( count( $out ) < count( $value ) ) {
				$errors[] = $path . ': dropped invalid or extra colours';
			}
			if ( count( $out ) < $min ) {
				$errors[] = $path . ': needs at least ' . $min . ' colour(s)';
				return null;
			}
			return $out;
		}

		if ( is_string( $template ) && preg_match( self::HEX, $template ) ) {
			if ( is_string( $value ) && preg_match( self::HEX, $value ) ) {
				return strtolower( $value );
			}
			$errors[] = $path . ': expected a #rrggbb colour';
			return null;
		}

		if ( isset( self::ENUMS[ $path ] ) ) {
			if ( is_string( $value ) && in_array( $value, self::ENUMS[ $path ], true ) ) {
				return $value;
			}
			$errors[] = $path . ': expected one of ' . implode( ', ', self::ENUMS[ $path ] );
			return null;
		}

		if ( is_string( $template ) ) {
			// Style names: a plain lowercase name; whether it exists is decided when drawing.
			if ( is_string( $value ) && preg_match( self::NAME, $value ) ) {
				return $value;
			}
			$errors[] = $path . ': expected a style name';
			return null;
		}

		if ( is_int( $template ) || is_float( $template ) ) {
			if ( ! ( is_int( $value ) || is_float( $value ) ) || ! is_finite( (float) $value ) ) {
				$errors[] = $path . ': expected a number';
				return null;
			}
			if ( ! isset( self::RANGES[ $path ] ) ) {
				$errors[] = $path . ': no range defined';
				return null;
			}
			list( $min, $max ) = self::RANGES[ $path ];
			$clamped           = min( $max, max( $min, $value ) );
			if ( (float) $clamped !== (float) $value ) {
				$errors[] = $path . ': clamped to ' . $clamped;
			}
			return $clamped;
		}

		if ( is_bool( $template ) ) {
			if ( is_bool( $value ) ) {
				return $value;
			}
			$errors[] = $path . ': expected true or false';
			return null;
		}

		$errors[] = $path . ': unsupported value';
		return null;
	}
}
