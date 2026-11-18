/**
 * Things add-ons hang on the store's walls (pictures, screens): where they fit, and
 * laying boxes and planes along a wall. Shared through AislezaWorld.helpers.
 *
 * Each wall item names a wall (right, left, back or the entrance wall) and, optionally, a
 * position along it (0–100 %, left to right as you face that wall); without one it takes the
 * free spot nearest the middle. Items keep clear of the doors, the corner trees, the feature
 * walls and other items (the zones reported so far) and each other; one that cannot fit is left out.
 */
export const WALL = {
	gap: 0.4, // Wall kept clear between items and around obstacles.
	edge: 0.1 // Added to an item's width for its frame.
};

export const WALLS = [ 'right', 'left', 'back', 'front' ];

/**
 * Each wall as a line seen from inside the store: t runs along it (x for the back and entrance
 * walls, depth for the side walls); `left` is the end at your left as you face it; `blocked`
 * are stretches nothing may cover (feature walls, the doors and the trees beside them).
 */
export function wallLines( L, zones ) {
	const depth = L.dBack;
	const doorX = L.start.x;
	const zone = ( wall ) => zones.filter( ( z ) => z.wall === wall ).map( ( z ) => [ z.from, z.to ] );
	return {
		right: { alongX: false, fixed: L.xMax, inward: -1, from: 0.6, to: depth - 1.8, left: 'to', blocked: zone( 'right' ) },
		left: { alongX: false, fixed: L.xMin, inward: 1, from: 1.9, to: depth - 1.8, left: 'from', blocked: zone( 'left' ) },
		back: { alongX: true, fixed: -depth, inward: 1, from: L.xMin + 1.8, to: L.xMax - 1.8, left: 'from', blocked: zone( 'back' ) },
		front: { alongX: true, fixed: 0, inward: -1, from: L.xMin + 1.9, to: L.xMax - 0.6, left: 'to', blocked: zone( 'front' ).concat( [ [ doorX - 3.5, doorX + 3.5 ] ] ) }
	};
}

/** The centre (t) nearest `want` where an item `width` wide fits on its wall, or null. */
function nearestSpot( line, taken, width, want ) {
	const half = width / 2 + WALL.gap;
	const lo = line.from + width / 2;
	const hi = line.to - width / 2;
	if ( lo > hi ) {
		return null;
	}
	const fits = ( t ) => t >= lo && t <= hi && ! line.blocked.concat( taken ).some( ( [ a, b ] ) => t + half > a && t - half < b );
	const start = Math.max( lo, Math.min( hi, want ) );
	for ( let step = 0; step <= hi - lo + 0.05; step += 0.05 ) {
		if ( fits( start - step ) ) {
			return start - step;
		}
		if ( fits( start + step ) ) {
			return start + step;
		}
	}
	return null;
}

/**
 * Place wall items ({ id, w, h, wall, position }, in priority order): those with a position
 * first, then the rest, each at the free spot nearest where it wants to be. Returns
 * { id, k, wall, line, t, w, h } per item that fits (k: its index in `items`), in item order.
 */
export function wallSpots( L, zones, items ) {
	const lines = wallLines( L, Array.isArray( zones ) ? zones : [] );
	const taken = { right: [], left: [], back: [], front: [] };
	const out = [];
	const list = Array.isArray( items ) ? items : [];
	const placed = ( p ) => typeof p.position === 'number' && p.position >= 0 && p.position <= 100;
	const order = list.map( ( p, k ) => k ).sort( ( a, b ) => placed( list[ b ] ) - placed( list[ a ] ) || a - b );
	order.forEach( ( k ) => {
		const p = list[ k ];
		if ( ! p || ! ( p.w > 0 ) || ! ( p.h > 0 ) ) {
			return;
		}
		const wall = WALLS.includes( p.wall ) ? p.wall : 'right';
		const line = lines[ wall ];
		const { w, h } = p;
		let want = ( line.from + line.to ) / 2;
		if ( placed( p ) ) {
			// 0 % = your left end as you face the wall, 100 % = your right end.
			const share = 'from' === line.left ? p.position / 100 : 1 - p.position / 100;
			want = line.from + ( line.to - line.from ) * share;
		}
		const t = nearestSpot( line, taken[ wall ], w + WALL.edge, want );
		if ( null !== t ) {
			taken[ wall ].push( [ t - ( w + WALL.edge ) / 2, t + ( w + WALL.edge ) / 2 ] );
			out.push( { id: p.id, k, wall, line, t, w, h } );
		}
	} );
	return out.sort( ( a, b ) => a.k - b.k );
}

/** The wall zone a placed item takes, for a fixture to report so later wall items keep clear. */
export function spotZone( spot ) {
	return { wall: spot.wall, from: spot.t - ( spot.w + WALL.edge ) / 2, to: spot.t + ( spot.w + WALL.edge ) / 2 };
}

/** A box laid along a wall: `along` metres from t, `off` metres into the room, centred at height y. */
export function wallBox( batch, line, t, mat, along, off, y, len, height, thick ) {
	if ( line.alongX ) {
		batch.box( mat, len, height, thick, t + along, y, line.fixed + line.inward * off );
	} else {
		batch.box( mat, thick, height, len, line.fixed + line.inward * off, y, -( t + along ) );
	}
}

/** Put a plane mesh on a wall at t, `off` metres into the room, facing the room. */
export function onWall( mesh, line, t, y, off ) {
	if ( line.alongX ) {
		mesh.position.set( t, y, line.fixed + line.inward * off );
		mesh.rotation.y = line.inward > 0 ? 0 : Math.PI;
	} else {
		mesh.position.set( line.fixed + line.inward * off, y, -t );
		mesh.rotation.y = line.inward > 0 ? Math.PI / 2 : -Math.PI / 2;
	}
	return mesh;
}
