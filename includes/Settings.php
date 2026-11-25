<?php
/**
 * Add-on settings: one option, sanitized as a whole.
 *
 * @package Aisleza
 */

namespace Aisleza;

defined( 'ABSPATH' ) || exit;

/**
 * Option `aisleza_settings`. `sections` is null until the merchant saves the tab, which
 * means "use the default selection" (see Catalog\Sections::defaults()).
 */
final class Settings {

	public const OPTION = 'aisleza_settings';

	public const LAYOUTS = array( 'full', 'theme' );

	public const VIEWS = array( '3d', 'shelves' );

	public const ENTRY_LINKS = array( 'none', 'shop_banner' );

	public const OPEN_SIZES = array( 'page', 'window' );

	public const MIN_PER_SHELF = 4;

	public const MAX_PER_SHELF = 48;

	public const MAX_SECTIONS = 40;

	public const DEFAULT_ACCENT = '#0e7c66';

	/**
	 * Cached option for this request.
	 *
	 * @var array<string,mixed>|null
	 */
	private static $cache = null;

	/**
	 * Defaults.
	 *
	 * @return array<string,mixed>
	 */
	public static function defaults(): array {
		return array(
			'enabled'       => false,
			'page_id'       => 0,
			'layout'        => 'full',
			'view'          => '3d',
			'store_name'    => '',
			'accent'        => self::DEFAULT_ACCENT,
			'sections'      => null,
			'show_empty'    => false,
			'per_shelf'     => 12,
			'child_filters' => true,
			'entry_link'    => 'none',
			'product_link'  => false,
			'open_size'     => 'page',
		);
	}

	/**
	 * All settings merged over the defaults.
	 *
	 * @return array<string,mixed>
	 */
	public static function all(): array {
		if ( null === self::$cache ) {
			$stored      = get_option( self::OPTION, array() );
			self::$cache = self::sanitize( is_array( $stored ) ? $stored : array() );
		}

		return self::$cache;
	}

	/**
	 * One setting.
	 *
	 * @param string $key Key.
	 * @return mixed
	 */
	public static function get( string $key ) {
		$all = self::all();

		return $all[ $key ] ?? null;
	}

	/**
	 * Save (sanitized again here, so callers cannot store anything unexpected).
	 *
	 * @param array<string,mixed> $values Values to merge over the current settings.
	 */
	public static function update( array $values ): void {
		$merged = self::sanitize( array_merge( self::all(), $values ) );
		update_option( self::OPTION, $merged, false );
		self::$cache = $merged;
	}

	/**
	 * Forget the per-request cache (tests, multi-step saves).
	 */
	public static function flush_cache(): void {
		self::$cache = null;
	}

	/**
	 * The store name shown on signs: the merchant's choice or the site title.
	 */
	public static function store_name(): string {
		$name = (string) self::get( 'store_name' );

		return '' !== $name ? $name : wp_specialchars_decode( (string) get_bloginfo( 'name' ), ENT_QUOTES );
	}

	/**
	 * Sanitize a whole settings array. Unknown keys are dropped; every value is bounded.
	 *
	 * @param array<string,mixed> $raw Raw values.
	 * @return array<string,mixed>
	 */
	public static function sanitize( array $raw ): array {
		$out = self::defaults();

		$out['enabled']       = ! empty( $raw['enabled'] );
		$out['page_id']       = isset( $raw['page_id'] ) ? absint( $raw['page_id'] ) : 0;
		$out['layout']        = in_array( $raw['layout'] ?? '', self::LAYOUTS, true ) ? (string) $raw['layout'] : 'full';
		$out['view']          = in_array( $raw['view'] ?? '', self::VIEWS, true ) ? (string) $raw['view'] : '3d';
		$out['store_name']    = isset( $raw['store_name'] ) ? Text::limit( sanitize_text_field( (string) $raw['store_name'] ), 80 ) : '';
		$out['accent']        = self::color( $raw['accent'] ?? '', self::DEFAULT_ACCENT );
		$out['show_empty']    = ! empty( $raw['show_empty'] );
		$out['child_filters'] = ! array_key_exists( 'child_filters', $raw ) || ! empty( $raw['child_filters'] );
		$out['per_shelf']     = isset( $raw['per_shelf'] ) ? max( self::MIN_PER_SHELF, min( self::MAX_PER_SHELF, absint( $raw['per_shelf'] ) ) ) : 12;
		$out['entry_link']    = in_array( $raw['entry_link'] ?? '', self::ENTRY_LINKS, true ) ? (string) $raw['entry_link'] : 'none';
		$out['product_link']  = ! empty( $raw['product_link'] );
		$out['open_size']     = in_array( $raw['open_size'] ?? '', self::OPEN_SIZES, true ) ? (string) $raw['open_size'] : 'page';
		$out['sections']      = isset( $raw['sections'] ) && is_array( $raw['sections'] ) ? self::sections( $raw['sections'] ) : null;

		return $out;
	}

	/**
	 * Sanitize the ordered section list: unique positive term ids, at most MAX_SECTIONS.
	 *
	 * @param array<int|string,mixed> $rows Rows of { id, label, accent, image }.
	 * @return array<int,array{id:int,label:string,accent:string,image:bool}>
	 */
	public static function sections( array $rows ): array {
		$out  = array();
		$seen = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$id = absint( $row['id'] ?? 0 );
			if ( ! $id || isset( $seen[ $id ] ) ) {
				continue;
			}
			$seen[ $id ] = true;
			$out[]       = array(
				'id'     => $id,
				'label'  => Text::limit( sanitize_text_field( (string) ( $row['label'] ?? '' ) ), 60 ),
				'accent' => self::color( $row['accent'] ?? '', '' ),
				'image'  => ! empty( $row['image'] ),
			);
			if ( count( $out ) >= self::MAX_SECTIONS ) {
				break;
			}
		}

		return $out;
	}

	/**
	 * A #rrggbb colour or the fallback.
	 *
	 * @param mixed  $value    Raw value.
	 * @param string $fallback Fallback.
	 */
	private static function color( $value, string $fallback ): string {
		$color = sanitize_hex_color( is_string( $value ) ? trim( $value ) : '' );

		return $color ? strtolower( $color ) : $fallback;
	}
}
