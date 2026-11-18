<?php
/**
 * Aisles that show a product query instead of a category.
 *
 * @package Aisleza
 */

namespace Aisleza\Catalog;

defined( 'ABSPATH' ) || exit;

/**
 * Add-ons may add aisles that list products by a Store API query (aisleza_query_aisles), such as
 * new arrivals or products on sale. They join the category aisles at the start or the end. Only
 * the query keys and values below are passed on, so an aisle stays a plain product listing.
 */
final class QueryAisles {

	public const ORDERBY = array( 'date', 'popularity', 'price', 'rating', 'title', 'menu_order' );

	/**
	 * The category sections with the add-ons' query aisles placed at the start or the end.
	 *
	 * @param array<int,array<string,mixed>> $sections Category sections.
	 * @param array<string,mixed>            $settings Store settings (accent, show_empty).
	 * @return array<int,array<string,mixed>>
	 */
	public static function merge( array $sections, array $settings ): array {
		/**
		 * Aisles that list products by a query.
		 *
		 * Each entry: array( 'key' => string ([a-z0-9-], names the aisle for the add-on),
		 * 'label' => string, 'query' => array (Store API parameters: orderby, order, on_sale,
		 * featured, after, before), 'count' => int (products in it, for the store's size and the
		 * map), 'position' => 'start'|'end' ). An aisle with no products is hidden unless the store
		 * shows empty aisles; invalid entries and repeated keys are dropped.
		 *
		 * @param array<int,mixed>    $aisles   Query aisles.
		 * @param array<string,mixed> $settings Store settings.
		 */
		$raw = apply_filters( 'aisleza_query_aisles', array(), $settings );
		if ( ! is_array( $raw ) || ! $raw ) {
			return $sections;
		}
		$start = array();
		$end   = array();
		foreach ( self::clean( $raw ) as $aisle ) {
			if ( $aisle['count'] <= 0 && empty( $settings['show_empty'] ) ) {
				continue;
			}
			$section = array(
				'id'      => 0,
				'label'   => $aisle['label'],
				'name'    => $aisle['label'],
				'accent'  => (string) ( $settings['accent'] ?? '' ),
				'image'   => '',
				'count'   => $aisle['count'],
				'filters' => array(),
				'key'     => $aisle['key'],
				'query'   => $aisle['query'],
			);
			if ( 'start' === $aisle['position'] ) {
				$start[] = $section;
			} else {
				$end[] = $section;
			}
		}
		return array_merge( $start, $sections, $end );
	}

	/**
	 * Valid query aisles: a key, a label and a query with at least one allowed parameter.
	 *
	 * @param array<int,mixed> $raw Aisles from add-ons.
	 * @return array<int,array{key:string,label:string,query:array<string,string>,count:int,position:string}>
	 */
	public static function clean( array $raw ): array {
		$out  = array();
		$seen = array();
		foreach ( $raw as $aisle ) {
			if ( ! is_array( $aisle ) ) {
				continue;
			}
			$key   = isset( $aisle['key'] ) && is_string( $aisle['key'] ) && preg_match( '/^[a-z0-9-]{1,40}$/D', $aisle['key'] ) ? $aisle['key'] : '';
			$label = isset( $aisle['label'] ) && is_string( $aisle['label'] ) ? sanitize_text_field( $aisle['label'] ) : '';
			$label = \Aisleza\Text::limit( $label, 40 );
			$query = self::query( isset( $aisle['query'] ) && is_array( $aisle['query'] ) ? $aisle['query'] : array() );
			if ( '' === $key || isset( $seen[ $key ] ) || '' === $label || ! $query ) {
				continue;
			}
			$seen[ $key ] = true;
			$out[]        = array(
				'key'      => $key,
				'label'    => $label,
				'query'    => $query,
				'count'    => isset( $aisle['count'] ) && is_numeric( $aisle['count'] ) ? max( 0, (int) $aisle['count'] ) : 0,
				'position' => isset( $aisle['position'] ) && 'start' === $aisle['position'] ? 'start' : 'end',
			);
		}
		return $out;
	}

	/**
	 * The allowed Store API parameters of a query, as strings.
	 *
	 * @param array<string,mixed> $raw Query from an add-on.
	 * @return array<string,string>
	 */
	public static function query( array $raw ): array {
		$out = array();
		if ( isset( $raw['orderby'] ) && in_array( $raw['orderby'], self::ORDERBY, true ) ) {
			$out['orderby'] = $raw['orderby'];
		}
		if ( isset( $raw['order'] ) && in_array( $raw['order'], array( 'asc', 'desc' ), true ) ) {
			$out['order'] = $raw['order'];
		}
		foreach ( array( 'on_sale', 'featured' ) as $flag ) {
			if ( isset( $raw[ $flag ] ) && in_array( $raw[ $flag ], array( true, 'true' ), true ) ) {
				$out[ $flag ] = 'true';
			}
		}
		foreach ( array( 'after', 'before' ) as $date ) {
			if ( isset( $raw[ $date ] ) && is_string( $raw[ $date ] ) && preg_match( '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/D', $raw[ $date ] ) ) {
				$out[ $date ] = $raw[ $date ];
			}
		}
		return $out;
	}
}
