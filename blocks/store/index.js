/**
 * Aisleza 3D Store block (editor side). The store itself is drawn on the live page by the
 * [aisleza] shortcode (render callback in PHP); the editor shows a card that says so, with a link
 * to the settings. Plain ES5 + wp globals, no build step.
 */
( function ( blocks, blockEditor, element, i18n ) {
	var el = element.createElement;
	var __ = i18n.__;
	var useBlockProps = blockEditor.useBlockProps;

	blocks.registerBlockType( 'aisleza/store', {
		edit: function () {
			var props = useBlockProps( { className: 'aisleza-block' } );
			return el( 'div', props,
				el( 'span', { className: 'aisleza-block__icon dashicons dashicons-store', 'aria-hidden': 'true' } ),
				el( 'p', { className: 'aisleza-block__title' }, __( 'Aisleza 3D Store', 'aisleza-3d-virtual-store-for-woocommerce' ) ),
				el( 'p', { className: 'aisleza-block__text' }, __( 'Your walk-in 3D store appears here on the live page. Preview the page to walk around it.', 'aisleza-3d-virtual-store-for-woocommerce' ) ),
				el( 'a', { className: 'aisleza-block__link', href: 'admin.php?page=aisleza', target: '_blank', rel: 'noopener noreferrer' }, __( 'Store settings', 'aisleza-3d-virtual-store-for-woocommerce' ) )
			);
		},
		save: function () {
			return null; // Rendered on the server.
		}
	} );
}( window.wp.blocks, window.wp.blockEditor, window.wp.element, window.wp.i18n ) );
