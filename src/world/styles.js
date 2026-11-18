/**
 * Style registry: the five parts of the building a skin can choose a style for.
 *
 *   ceiling  - everything overhead (ceiling, lights, tracks)
 *   walls    - the wall surfaces, leaving clear the stretches a feature occupies
 *   feature  - feature walls and what stands in front of them
 *   shelving - the dressing of every gondola (panels, shelves, lights, signs on top)
 *   floor    - the floor's picture: a builder returns a canvas covering two tiles each way
 *
 * The free plugin registers only the Boutique styles (scene.js). Add-ons may register more
 * with AislezaWorld.registerStyle(); a skin then selects them by name (skin.styles). Boutique's
 * styles can't be replaced, and an unknown name always falls back to them.
 */

export const KINDS = [ 'ceiling', 'walls', 'feature', 'shelving', 'floor' ];

/** The Boutique style of each part. */
export const BUILT_IN = { ceiling: 'slats', walls: 'slats', feature: 'living', shelving: 'oak', floor: 'stone' };

const registry = { ceiling: {}, walls: {}, feature: {}, shelving: {}, floor: {} };

function own( table, key ) {
	return Object.prototype.hasOwnProperty.call( table, key ) ? table[ key ] : undefined;
}

/**
 * Register a style builder. Returns false when refused (unknown part, bad name, not a
 * function, or an attempt to replace a Boutique style).
 */
export function registerStyle( kind, name, builder ) {
	if ( ! KINDS.includes( kind ) || typeof name !== 'string' || ! /^[a-z0-9-]{1,32}$/.test( name ) || typeof builder !== 'function' ) {
		return false;
	}
	if ( name === BUILT_IN[ kind ] && own( registry[ kind ], name ) ) {
		return false;
	}
	registry[ kind ][ name ] = builder;
	return true;
}

/** The builder for a part's style, and the Boutique builder to fall back to. */
export function styleFor( kind, name ) {
	const fallback = registry[ kind ][ BUILT_IN[ kind ] ];
	return { builder: own( registry[ kind ], name ) || fallback, fallback };
}
