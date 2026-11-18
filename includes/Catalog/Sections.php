<?php
/**
 * WooCommerce product categories → store sections.
 *
 * @package Aisleza
 */

namespace Aisleza\Catalog;

defined( 'ABSPATH' ) || exit;

/**
 * Sections keep the real category ids; products are never copied. A category that was
 * deleted is skipped, a renamed one shows its new name unless the merchant set a label,
 * and an empty one is hidden unless "show empty sections" is on.
 *
 * Term lookups are injected so the rules can be tested without WordPress.
 */
class Sections {

	/**
	 * Term by id: fn( int ): ?array{id:int,name:string,parent:int,count:int,image:string}.
	 *
	 * @var callable
	 */
	private $term;

	/**
	 * Child terms: fn( int ): array<int,array{id:int,name:string,parent:int,count:int,image:string}>.
	 *
	 * @var callable
	 */
	private $children;

	/**
	 * Default category id (WooCommerce's "Uncategorized"), excluded from the default selection.
	 *
	 * @var int
	 */
	private $default_cat;

	/**
	 * Constructor.
	 *
	 * @param callable $term        Term lookup.
	 * @param callable $children    Child lookup (0 = top level).
	 * @param int      $default_cat Default category id.
	 */
	public function __construct( callable $term, callable $children, int $default_cat = 0 ) {
		$this->term        = $term;
		$this->children    = $children;
		$this->default_cat = $default_cat;
	}

	/**
	 * Sections backed by the real product_cat taxonomy.
	 */
	public static function from_wordpress(): self {
		$shape = static function ( $term ): ?array {
			if ( ! $term instanceof \WP_Term || 'product_cat' !== $term->taxonomy ) {
				return null;
			}
			// WooCommerce keeps a visible-product count that includes child categories.
			$count = get_term_meta( $term->term_id, 'product_count_product_cat', true );
			$thumb = (int) get_term_meta( $term->term_id, 'thumbnail_id', true );

			return array(
				'id'     => (int) $term->term_id,
				'name'   => wp_specialchars_decode( $term->name, ENT_QUOTES ),
				'parent' => (int) $term->parent,
				'count'  => '' !== $count && is_numeric( $count ) ? (int) $count : (int) $term->count,
				'image'  => $thumb ? (string) wp_get_attachment_image_url( $thumb, 'medium' ) : '',
			);
		};

		return new self(
			static function ( int $id ) use ( $shape ) {
				return $shape( get_term( $id, 'product_cat' ) );
			},
			static function ( int $parent_id ) use ( $shape ) {
				$terms = get_terms(
					array(
						'taxonomy'   => 'product_cat',
						'parent'     => $parent_id,
						'hide_empty' => false,
						'orderby'    => 'name',
						'number'     => 200,
					)
				);

				return is_array( $terms ) ? array_values( array_filter( array_map( $shape, $terms ) ) ) : array();
			},
			(int) get_option( 'default_product_cat', 0 )
		);
	}

	/**
	 * The default selection: top-level categories that hold products, without "Uncategorized".
	 *
	 * @return array<int,array{id:int,label:string,accent:string,image:bool}>
	 */
	public function defaults(): array {
		$rows = array();
		foreach ( (array) call_user_func( $this->children, 0 ) as $term ) {
			if ( (int) $term['id'] === $this->default_cat || (int) $term['count'] <= 0 ) {
				continue;
			}
			$rows[] = array(
				'id'     => (int) $term['id'],
				'label'  => '',
				'accent' => '',
				'image'  => false,
			);
		}

		return $rows;
	}

	/**
	 * The configured rows, or the defaults when the merchant never saved the tab.
	 *
	 * @param array<string,mixed> $settings Settings.
	 * @return array<int,array{id:int,label:string,accent:string,image:bool}>
	 */
	public function rows( array $settings ): array {
		return is_array( $settings['sections'] ?? null ) ? $settings['sections'] : $this->defaults();
	}

	/**
	 * Sections for the storefront, in the merchant's order.
	 *
	 * @param array<string,mixed> $settings Settings.
	 * @return array<int,array{id:int,label:string,name:string,accent:string,image:string,count:int,filters:array}>
	 */
	public function build( array $settings ): array {
		$out = array();
		foreach ( $this->rows( $settings ) as $row ) {
			$term = call_user_func( $this->term, (int) $row['id'] );
			if ( ! $term ) {
				continue; // Deleted category.
			}
			if ( (int) $term['count'] <= 0 && empty( $settings['show_empty'] ) ) {
				continue;
			}

			$filters = array();
			if ( ! empty( $settings['child_filters'] ) ) {
				foreach ( (array) call_user_func( $this->children, (int) $term['id'] ) as $child ) {
					if ( (int) $child['count'] > 0 || ! empty( $settings['show_empty'] ) ) {
						$filters[] = array(
							'id'    => (int) $child['id'],
							'name'  => (string) $child['name'],
							'count' => (int) $child['count'],
						);
					}
				}
			}

			$out[] = array(
				'id'      => (int) $term['id'],
				'label'   => '' !== $row['label'] ? $row['label'] : (string) $term['name'],
				'name'    => (string) $term['name'],
				'accent'  => '' !== $row['accent'] ? $row['accent'] : (string) ( $settings['accent'] ?? '' ),
				'image'   => $row['image'] ? (string) $term['image'] : '',
				'count'   => (int) $term['count'],
				'filters' => $filters,
			);
		}

		return $out;
	}

	/**
	 * Every category for the admin table: top level first, each followed by its children
	 * (two levels; deeper categories are reachable as filters of their parent).
	 *
	 * @return array<int,array{id:int,name:string,parent:int,count:int,image:string,depth:int}>
	 */
	public function all_for_admin(): array {
		$out = array();
		foreach ( (array) call_user_func( $this->children, 0 ) as $term ) {
			$out[] = $term + array( 'depth' => 0 );
			foreach ( (array) call_user_func( $this->children, (int) $term['id'] ) as $child ) {
				$out[] = $child + array( 'depth' => 1 );
			}
		}

		return $out;
	}
}
