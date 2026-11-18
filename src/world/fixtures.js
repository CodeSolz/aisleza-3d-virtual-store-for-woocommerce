/**
 * Fixtures: furniture an add-on builds into the store (a display table, a stand, a kiosk).
 *
 *   world.registerFixture( 'my-table', ( ctx ) => { … return { obstacles, zones, displays }; } );
 *
 * Builders run while the store is built, after the shelving, in the order they registered.
 * ctx = { batch, group, M, L, S, opts, accent, zones, helpers, config, claimEnd } (see
 * docs/INTEGRATION-CONTRACT.md "Fixtures"). A builder returns, all optional:
 *   obstacles: floor rectangles { minX, maxX, minZ, maxZ } the shopper and trolley go around;
 *   zones:     stretches of wall { wall, from, to } that wall pictures added later leave clear;
 *   displays:  { key, slots, products } — product ids shown at the slot positions, stocked and
 *              clickable like shelf products, and listed for keyboard and screen-reader shoppers.
 * A builder that throws is left out (its parts and claimed shelf ends too); the store still opens.
 */
const registry = new Map();

/** Add (or replace) the fixture called name. Returns whether it was accepted. */
export function registerFixture( name, builder ) {
	if ( typeof name !== 'string' || ! /^[a-z0-9-]{1,32}$/.test( name ) || typeof builder !== 'function' ) {
		return false;
	}
	registry.set( name, builder );
	return true;
}

/** The registered fixtures, in registration order. */
export function fixtures() {
	return Array.from( registry, ( [ name, builder ] ) => ( { name, builder } ) );
}

const finite = ( v ) => typeof v === 'number' && Number.isFinite( v );

/** A display's slots, kept only when every number is real: { x, y, z, rot, face, edge }. */
export function displaySlots( raw ) {
	return ( Array.isArray( raw ) ? raw : [] ).filter( ( s ) => s && [ s.x, s.y, s.z ].every( finite ) ).slice( 0, 24 ).map( ( s ) => ( {
		x: s.x,
		y: s.y,
		z: s.z,
		rot: finite( s.rot ) ? s.rot : 0,
		face: s.face === -1 ? -1 : 1,
		edge: finite( s.edge ) ? s.edge : s.z
	} ) );
}

/** A display from a builder, or null: { key, slots, products } with positive integer ids. */
export function displayOf( name, raw ) {
	if ( ! raw || typeof raw.key !== 'string' || ! /^[a-z0-9-]{1,40}$/.test( raw.key ) ) {
		return null;
	}
	const slots = displaySlots( raw.slots );
	const products = ( Array.isArray( raw.products ) ? raw.products : [] ).filter( ( id, i, all ) => Number.isInteger( id ) && id > 0 && all.indexOf( id ) === i ).slice( 0, slots.length );
	return slots.length && products.length ? { key: name + ':' + raw.key, slots, products } : null;
}
