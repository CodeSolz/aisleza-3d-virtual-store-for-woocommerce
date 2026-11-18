/**
 * Skins: the store's whole look as data. The engine reads every colour, material choice and
 * decor switch from a skin object; nothing about the look is hard-coded elsewhere.
 *
 * The Boutique skin (skins/boutique/skin.json) is bundled and is the base of every skin: a
 * skin only states what it changes, and anything it leaves out comes from Boutique.
 */
import BOUTIQUE from '../../skins/boutique/skin.json';
import { validateSkin } from './schema.js';

export { BOUTIQUE };

function isObject( v ) {
	return v !== null && typeof v === 'object' && ! Array.isArray( v );
}

/** Deep merge: objects merge key by key, everything else (arrays included) replaces. */
function merge( base, over ) {
	const out = {};
	Object.keys( base ).forEach( ( k ) => {
		out[ k ] = isObject( base[ k ] ) ? merge( base[ k ], {} ) : base[ k ];
	} );
	if ( isObject( over ) ) {
		Object.keys( over ).forEach( ( k ) => {
			out[ k ] = isObject( out[ k ] ) && isObject( over[ k ] ) ? merge( out[ k ], over[ k ] ) : over[ k ];
		} );
	}
	return out;
}

/**
 * The skin the engine draws: the valid parts of the given skin on top of Boutique. Problems
 * are reported in the console (once) and never stop the store from opening.
 */
export function resolveSkin( skin ) {
	if ( skin === undefined || skin === null ) {
		return merge( BOUTIQUE, {} );
	}
	const checked = validateSkin( skin, BOUTIQUE );
	if ( checked.errors.length && typeof console !== 'undefined' ) {
		console.warn( 'Aisleza skin: ' + checked.errors.join( '; ' ) ); // eslint-disable-line no-console
	}
	const out = merge( BOUTIQUE, checked.skin || {} );
	// Shelving wood follows the wall wood unless the skin chooses its own.
	if ( ! ( checked.skin && checked.skin.palette && checked.skin.palette.shelfWood ) ) {
		out.palette.shelfWood = out.palette.wood;
	}
	// The entrance wall follows the other walls unless the skin chooses its own.
	const own = checked.skin || {};
	if ( ! ( own.styles && own.styles.entrance ) ) {
		out.styles.entrance = out.styles.walls;
	}
	[ [ 'entranceColour', 'colour' ], [ 'entranceJoint', 'joint' ] ].forEach( ( [ key, from ] ) => {
		if ( ! ( own.walls && own.walls[ key ] ) ) {
			out.walls[ key ] = out.walls[ from ];
		}
	} );
	return out;
}

/** '#rrggbb' + alpha → 'rgba(r, g, b, a)' for canvas drawing. */
export function rgba( hex, alpha ) {
	const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec( hex || '' );
	const n = m ? [ m[ 1 ], m[ 2 ], m[ 3 ] ].map( ( h ) => parseInt( h, 16 ) ) : [ 0, 0, 0 ];
	return 'rgba(' + n.join( ', ' ) + ', ' + alpha + ')';
}
