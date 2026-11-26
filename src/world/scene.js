/**
 * The building: hall, entrance, lighting, shelving gondolas, aisle signs and checkout lanes.
 *
 * Coordinates are metres. The entrance wall is at z = 0 and the store extends towards -z,
 * so "depth" d = -z. Aisle i is the walkway between gondola i and gondola i+1; both of its
 * shelf faces belong to section i.
 *
 * The look is a warm boutique interior: oak shelving lit by LED strips under every shelf,
 * sage-green gondola ends, serif signs on deep green, an oak slat ceiling with linear lights,
 * honed limestone floor, living plant walls and potted olive trees. Every colour and decor
 * switch comes from the active skin (skin.js). Static parts are merged into one mesh per
 * material (a few dozen draw calls for the whole store).
 */
import {
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	CanvasTexture,
	CapsuleGeometry,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DoubleSide,
	Euler,
	Group,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	Points,
	SRGBColorSpace,
	ShaderMaterial,
	SphereGeometry,
	TorusGeometry,
	Vector3,
	VideoTexture
} from 'three';
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILT_IN, registerStyle, styleFor } from './styles.js';
import { displayOf, fixtures } from './fixtures.js';
import { onWall, spotZone, WALL, wallBox, wallSpots } from './walls.js';
import {
	floorCanvas,
	inkOn,
	livingWallCanvas,
	outsideCanvas,
	plantCanvas,
	plaqueCanvas,
	shadowCanvas,
	shelfBackCanvas,
	signCanvas,
	slatCanvas,
	toTexture,
	woodCanvas
} from './textures.js';

export const SHELF = {
	pitch: 3.8, // Gondola centre to gondola centre.
	depth: 0.9, // Gondola depth (two faces back to back).
	bay: 1.2, // Bay length.
	slots: 3, // Product facings per bay per shelf.
	levels: [ 0.2, 0.64, 1.08, 1.52 ], // Shelf surfaces (m).
	fill: [ 2, 1, 3, 0 ], // Eye level first, then down, up, floor.
	boxW: 0.34,
	boxH: 0.38,
	boxD: 0.26,
	height: 2.05,
	front: 8 // Depth where the aisles start.
};

const CEIL = 3.72; // Ceiling (the dark void above the slats).
const SLATS = 3.5; // Underside of the oak slat ceiling.
const LIVING_M = 4.8; // Metres of wall one living-wall texture repeat covers (2:1 canvas, 2.4 m tall).

/** Store dimensions for n aisles whose largest section has maxCount products. */
export function layout( n, maxCount ) {
	const perBay = SHELF.slots * SHELF.levels.length * 2; // Both faces.
	const bays = Math.max( 3, Math.min( 8, Math.ceil( ( Math.max( 1, maxCount ) * 3 ) / perBay ) ) );
	const length = bays * SHELF.bay;
	const d1 = SHELF.front;
	const d2 = d1 + length;
	const lastGondola = n * SHELF.pitch;
	const laneX = lastGondola + 4.6;
	return {
		n,
		bays,
		length,
		d1,
		d2,
		// Cross-aisles, the routes between aisles: far enough from the shelf ends (front) and the
		// back wall that the trolley's nose (1.5 m ahead + 0.3 m) never touches them.
		dCross: d1 - 2.1,
		dBackCross: d2 + 1.4,
		xMin: -4,
		xMax: lastGondola + 8,
		dBack: d2 + 3.4,
		gondolaX: ( k ) => k * SHELF.pitch,
		aisleX: ( i ) => i * SHELF.pitch + SHELF.pitch / 2,
		lanes: [ laneX - 1.45, laneX + 1.45 ], // Checkout counters (x centres).
		laneX,
		counterD: [ 2.8, 5.4 ],
		// Start in line with the middle aisle's walkway, never with a shelving unit.
		start: { x: n ? Math.floor( n / 2 ) * SHELF.pitch + ( n % 2 ? SHELF.pitch / 2 : -SHELF.pitch / 2 ) : 2, d: 2.4, yaw: 0 }
	};
}

/** Every material of the building, in the skin's colours (built once per store). */
function materials( S ) {
	const P = S.palette;
	return {
		oak: new MeshStandardMaterial( { map: toTexture( woodCanvas( S ) ), roughness: 0.55 } ),
		shelf: new MeshStandardMaterial( { map: toTexture( woodCanvas( S, P.shelfWood ) ), roughness: 0.55 } ),
		oakDark: new MeshStandardMaterial( { color: P.woodDark, roughness: 0.6 } ),
		sage: new MeshStandardMaterial( { color: P.endPanel, roughness: 0.8 } ),
		green: new MeshStandardMaterial( { color: P.sign, roughness: 0.7 } ),
		plaster: new MeshStandardMaterial( { color: P.plaster, roughness: 0.95 } ),
		gap: new MeshStandardMaterial( { color: P.void, roughness: 1 } ),
		led: new MeshBasicMaterial( { color: P.led, toneMapped: false } ),
		black: new MeshStandardMaterial( { color: P.metal, roughness: 0.45, metalness: 0.4 } ),
		stone: new MeshStandardMaterial( { color: P.stone, roughness: 0.92 } ),
		soil: new MeshStandardMaterial( { color: P.soil, roughness: 1 } ),
		bark: new MeshStandardMaterial( { color: P.bark, roughness: 0.9 } ),
		leaf: new MeshStandardMaterial( { map: toTexture( plantCanvas( S, false ) ), alphaTest: 0.5, side: DoubleSide, roughness: 0.8 } ),
		olive: new MeshStandardMaterial( { map: toTexture( plantCanvas( S, true ) ), alphaTest: 0.45, side: DoubleSide, roughness: 0.85 } ),
		living: new MeshStandardMaterial( { map: toTexture( livingWallCanvas( S ), [ 1, 1 ] ), roughness: 0.9 } ),
		shadow: new MeshBasicMaterial( { map: toTexture( shadowCanvas( S ) ), transparent: true, depthWrite: false } ),
		glass: new MeshStandardMaterial( { color: P.glass, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1 } ),
		outside: new MeshBasicMaterial( { map: toTexture( outsideCanvas( S ) ), toneMapped: false } ),
		counterTop: new MeshStandardMaterial( { color: P.counterTop, roughness: 0.35 } ),
		belt: new MeshStandardMaterial( { color: P.belt, roughness: 0.9 } ),
		screen: new MeshBasicMaterial( { color: P.screen, toneMapped: false } )
	};
}

/** Collects static geometry per material and merges it into one mesh each. */
class Batch {
	constructor() {
		this.parts = new Map();
	}

	add( material, geometry ) {
		if ( ! this.parts.has( material ) ) {
			this.parts.set( material, [] );
		}
		this.parts.get( material ).push( geometry );
		return geometry;
	}

	box( material, w, h, d, x, y, z ) {
		return this.add( material, new BoxGeometry( w, h, d ).translate( x, y, z ) );
	}

	/** Take over everything another batch collected. */
	absorb( other ) {
		other.parts.forEach( ( list, material ) => list.forEach( ( geo ) => this.add( material, geo ) ) );
		other.parts.clear();
	}

	flush( group ) {
		this.parts.forEach( ( list, material ) => {
			const merged = mergeGeometries( list, false );
			list.forEach( ( geo ) => geo.dispose() );
			group.add( new Mesh( merged, material ) );
		} );
		this.parts.clear();
	}
}

const EUL = new Euler();
const MAT = new Matrix4();

/** Rotate (x first, then y) and move a geometry in place. */
function place( geo, x, y, z, ry, rx ) {
	EUL.set( rx || 0, ry || 0, 0, 'YXZ' );
	MAT.makeRotationFromEuler( EUL ).setPosition( x, y, z );
	return geo.applyMatrix4( MAT );
}

function uvScale( geo, su, sv ) {
	const uv = geo.attributes.uv;
	for ( let i = 0; i < uv.count; i++ ) {
		uv.setXY( i, uv.getX( i ) * su, uv.getY( i ) * sv );
	}
	return geo;
}

function texturedPlane( w, h, canvas, x, y, z, ry ) {
	const m = new Mesh( new PlaneGeometry( w, h ), new MeshBasicMaterial( { map: toTexture( canvas ), toneMapped: false } ) );
	m.position.set( x, y, z );
	m.rotation.y = ry || 0;
	return m;
}

/** Three crossed leaf cards: a plant from every side. hang=true lets it trail downwards. */
function plant( batch, material, x, y, z, w, h, hang ) {
	for ( let k = 0; k < 3; k++ ) {
		batch.add( material, place( new PlaneGeometry( w, h ).translate( 0, h / 2, 0 ), x, y, z, k * Math.PI / 3 + 0.3, hang ? Math.PI : 0 ) );
	}
}

/** Soft contact shadow on the floor under something w × d. */
function shadow( batch, M, x, z, w, d ) {
	batch.add( M.shadow, place( new PlaneGeometry( w, d ), x, 0.004, z, 0, -Math.PI / 2 ) );
}

/** A potted olive tree on the floor; returns its collision box. */
function oliveTree( batch, M, x, d ) {
	const z = -d;
	batch.add( M.stone, new CylinderGeometry( 0.36, 0.28, 0.72, 20 ).translate( x, 0.36, z ) );
	batch.add( M.soil, place( new CircleGeometry( 0.33, 20 ), x, 0.7, z, 0, -Math.PI / 2 ) );
	batch.add( M.bark, new CylinderGeometry( 0.035, 0.05, 1.3, 8 ).translate( x, 1.3, z ) );
	[ [ 0, 1.75, 0, 1.15 ], [ 0.22, 2.05, 0.1, 0.9 ], [ -0.2, 2.15, -0.12, 0.85 ], [ 0.05, 2.4, 0.05, 0.75 ] ].forEach( ( c ) => {
		plant( batch, M.olive, x + c[ 0 ], c[ 1 ] - c[ 3 ] / 2, z + c[ 2 ], c[ 3 ], c[ 3 ], false );
	} );
	shadow( batch, M, x, z, 1.3, 1.3 );
	return { minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 };
}

/**
 * Vertical oak slats over a dark backing, along a wall. The wall runs along x (alongX) at a
 * fixed z, or along z at a fixed x; `inward` is the unit step into the room; `skip(t)` leaves
 * gaps (for living walls and doors).
 */
function slatWall( batch, M, alongX, fixed, from, to, inward, skip ) {
	const backing = new PlaneGeometry( to - from, SLATS );
	const mid = ( from + to ) / 2;
	if ( alongX ) {
		place( backing, mid, SLATS / 2, fixed + inward * 0.005, inward > 0 ? 0 : Math.PI );
	} else {
		place( backing, fixed + inward * 0.005, SLATS / 2, -mid, inward > 0 ? Math.PI / 2 : -Math.PI / 2 );
	}
	batch.add( M.gap, backing );
	for ( let t = from + 0.06; t < to - 0.03; t += 0.11 ) {
		if ( skip && skip( t ) ) {
			continue;
		}
		if ( alongX ) {
			batch.box( M.oak, 0.05, SLATS, 0.045, t, SLATS / 2, fixed + inward * 0.035 );
		} else {
			batch.box( M.oak, 0.045, SLATS, 0.05, fixed + inward * 0.035, SLATS / 2, -t );
		}
	}
}

const SLAT_TILE = 16; // Slats in one repeat of slatCanvas().

/** Phones: one material showing slats as a picture (shared by the walls and the ceiling). */
function slatPictureMaterial( M, S ) {
	if ( ! M.slatPicture ) {
		const map = toTexture( slatCanvas( S ), [ 1, 1 ] );
		map.anisotropy = 8;
		M.slatPicture = new MeshStandardMaterial( { map, roughness: 0.6 } );
	}
	return M.slatPicture;
}

/** The parts of [from, to] that no zone covers. */
function freeStretches( from, to, zones ) {
	const out = [];
	let start = from;
	zones.slice().sort( ( a, b ) => a.from - b.from ).forEach( ( z ) => {
		if ( z.to <= start || z.from >= to ) {
			return;
		}
		if ( z.from > start ) {
			out.push( [ start, z.from ] );
		}
		start = Math.max( start, z.to );
	} );
	if ( start < to ) {
		out.push( [ start, to ] );
	}
	return out;
}

const WALLS = [ 'back', 'front', 'left', 'right' ];

/**
 * The walls asked for (all four by default) as runs { wall, alongX, fixed, from, to, inward }:
 * a wall runs along x at a fixed z, or along depth at a fixed x; `inward` is the unit step into
 * the room. The entrance wall comes in two runs, leaving the door opening clear.
 */
function wallRuns( L, walls ) {
	const want = Array.isArray( walls ) ? walls : WALLS;
	const doorX = L.start.x;
	return [
		{ wall: 'back', alongX: true, fixed: -L.dBack, from: L.xMin, to: L.xMax, inward: 1 },
		{ wall: 'front', alongX: true, fixed: 0, from: L.xMin, to: doorX - 2.13, inward: -1 },
		{ wall: 'front', alongX: true, fixed: 0, from: doorX + 2.13, to: L.xMax, inward: -1 },
		{ wall: 'left', alongX: false, fixed: L.xMin, from: 0, to: L.dBack, inward: 1 },
		{ wall: 'right', alongX: false, fixed: L.xMax, from: 0, to: L.dBack, inward: -1 }
	].filter( ( r ) => want.includes( r.wall ) );
}

/**
 * A flat plane over a wall run from height y0 to y1, `off` metres into the room, facing the
 * room. Its picture repeats every size[ 0 ] metres along the wall and size[ 1 ] metres up,
 * measured from the wall's start, so the pattern lines up across the door opening.
 */
function wallPlane( batch, material, run, size, off, y0, y1 ) {
	const len = run.to - run.from;
	const h = y1 - y0;
	if ( len < 0.02 || h <= 0 ) {
		return null;
	}
	const geo = new PlaneGeometry( len, h );
	const uv = geo.attributes.uv;
	for ( let i = 0; i < uv.count; i++ ) {
		// The plane is turned to face the room: its u runs along t on walls facing +x or -z.
		const along = run.inward > 0 ? uv.getX( i ) : 1 - uv.getX( i );
		uv.setXY( i, ( run.from + along * len ) / size[ 0 ], ( y0 + uv.getY( i ) * h ) / size[ 1 ] );
	}
	const mid = ( run.from + run.to ) / 2;
	if ( run.alongX ) {
		place( geo, mid, ( y0 + y1 ) / 2, run.fixed + run.inward * off, run.inward > 0 ? 0 : Math.PI );
	} else {
		place( geo, run.fixed + run.inward * off, ( y0 + y1 ) / 2, -mid, run.inward > 0 ? Math.PI / 2 : -Math.PI / 2 );
	}
	return batch.add( material, geo );
}

/** Phones: a slatted wall stretch as one flat plane at the slats' front face. */
function slatPlane( batch, material, alongX, fixed, from, to, inward, period ) {
	const len = to - from;
	if ( len < 0.02 ) {
		return;
	}
	const geo = uvScale( new PlaneGeometry( len, SLATS ), len / ( period * SLAT_TILE ), 1 );
	const mid = ( from + to ) / 2;
	if ( alongX ) {
		place( geo, mid, SLATS / 2, fixed + inward * 0.0575, inward > 0 ? 0 : Math.PI );
	} else {
		place( geo, fixed + inward * 0.0575, SLATS / 2, -mid, inward > 0 ? Math.PI / 2 : -Math.PI / 2 );
	}
	batch.add( material, geo );
}

/** A framed, backlit living-wall panel; w along the wall, centred at t. */
function livingPanel( batch, M, alongX, fixed, t, w, inward ) {
	const y0 = 0.45;
	const h = 2.45;
	const face = uvScale( new PlaneGeometry( w, h ), w / LIVING_M, 1 );
	const ry = alongX ? ( inward > 0 ? 0 : Math.PI ) : ( inward > 0 ? Math.PI / 2 : -Math.PI / 2 );
	const at = ( off, y, size ) => {
		// A box positioned along the wall: off = distance into the room.
		const geo = alongX ? new BoxGeometry( size[ 0 ], size[ 1 ], size[ 2 ] ) : new BoxGeometry( size[ 2 ], size[ 1 ], size[ 0 ] );
		return alongX ? geo.translate( t, y, fixed + inward * off ) : geo.translate( fixed + inward * off, y, -t );
	};
	batch.add( M.living, alongX ? place( face, t, y0 + h / 2, fixed + inward * 0.03, ry ) : place( face, fixed + inward * 0.03, y0 + h / 2, -t, ry ) );
	// Oak frame, a recessed LED cove along the top and a low ledge along the bottom.
	batch.add( M.oak, at( 0.08, y0 + h + 0.05, [ w + 0.2, 0.1, 0.16 ] ) );
	batch.add( M.oak, at( 0.08, y0 - 0.05, [ w + 0.2, 0.1, 0.2 ] ) );
	batch.add( M.oak, alongX ? new BoxGeometry( 0.1, h, 0.16 ).translate( t - w / 2 - 0.05, y0 + h / 2, fixed + inward * 0.08 ) : new BoxGeometry( 0.16, h, 0.1 ).translate( fixed + inward * 0.08, y0 + h / 2, -( t - w / 2 - 0.05 ) ) );
	batch.add( M.oak, alongX ? new BoxGeometry( 0.1, h, 0.16 ).translate( t + w / 2 + 0.05, y0 + h / 2, fixed + inward * 0.08 ) : new BoxGeometry( 0.16, h, 0.1 ).translate( fixed + inward * 0.08, y0 + h / 2, -( t + w / 2 + 0.05 ) ) );
	batch.add( M.led, at( 0.12, y0 + h - 0.01, [ w, 0.015, 0.03 ] ) );
	batch.add( M.stone, at( 0.06, y0 / 2 - 0.05, [ w + 0.2, y0 - 0.1, 0.12 ] ) );
}

/* ------------------------------------------------------------------------------------------
 * Boutique styles. Each builder gets ctx = { batch, M, L, S, group, opts, accent, zones,
 * helpers } and returns { obstacles, zones } (both optional).
 * ------------------------------------------------------------------------------------------ */

/** Ceiling: oak slats over a dark void, a plaster border with a lit cove, linear lights, tracks. */
function ceilingSlats( { batch, M, L, S, opts } ) {
	const width = L.xMax - L.xMin;
	const cx = ( L.xMin + L.xMax ) / 2;
	const depth = L.dBack;
	const zMid = -( L.d1 + L.d2 ) / 2;
	batch.add( M.gap, place( new PlaneGeometry( width, depth ), cx, CEIL, -depth / 2, 0, Math.PI / 2 ) );
	const inset = 0.9;
	if ( opts.mobile ) {
		// Phones: the slat field as one plane showing the slats as a picture.
		const w = width - inset * 2;
		const geo = uvScale( new PlaneGeometry( w, depth - inset * 2 ), w / ( 0.1 * SLAT_TILE ), 1 );
		batch.add( slatPictureMaterial( M, S ), place( geo, cx, SLATS, -depth / 2, 0, Math.PI / 2 ) );
	} else {
		for ( let x = L.xMin + inset + 0.05; x < L.xMax - inset; x += 0.1 ) {
			batch.box( M.oak, 0.045, 0.1, depth - inset * 2, x, SLATS + 0.05, -depth / 2 );
		}
	}
	[
		[ width, inset, cx, -inset / 2 ],
		[ width, inset, cx, -depth + inset / 2 ],
		[ inset, depth - inset * 2, L.xMin + inset / 2, -depth / 2 ],
		[ inset, depth - inset * 2, L.xMax - inset / 2, -depth / 2 ]
	].forEach( ( s ) => batch.box( M.plaster, s[ 0 ], 0.06, s[ 1 ], s[ 2 ], SLATS - 0.03, s[ 3 ] ) );
	[
		[ width - inset * 2, 0.03, cx, -inset ],
		[ width - inset * 2, 0.03, cx, -depth + inset ],
		[ 0.03, depth - inset * 2, L.xMin + inset, -depth / 2 ],
		[ 0.03, depth - inset * 2, L.xMax - inset, -depth / 2 ]
	].forEach( ( s ) => batch.box( M.led, s[ 0 ], 0.02, s[ 1 ], s[ 2 ], SLATS - 0.07, s[ 3 ] ) );
	// Linear lights run the length of the store over every aisle and the side walkways.
	const lightXs = [];
	for ( let i = 0; i < L.n; i++ ) {
		lightXs.push( L.aisleX( i ) );
	}
	lightXs.push( ( L.xMin + L.gondolaX( 0 ) ) / 2, L.laneX );
	lightXs.forEach( ( x ) => batch.box( M.led, 0.05, 0.02, depth - inset * 2 - 0.4, x, SLATS - 0.02, -depth / 2 ) );
	// Black track with spotlights over every gondola.
	for ( let k = 0; k <= L.n; k++ ) {
		const x = L.gondolaX( k );
		batch.box( M.black, 0.04, 0.04, L.length + 1.6, x, SLATS - 0.04, zMid );
		for ( let b = 0; b < L.bays; b++ ) {
			const z = -( L.d1 + ( b + 0.5 ) * SHELF.bay );
			[ -0.28, 0.28 ].forEach( ( o ) => {
				batch.add( M.black, new CylinderGeometry( 0.045, 0.04, 0.16, 12 ).translate( x + o, SLATS - 0.14, z ) );
				batch.box( M.black, 0.02, 0.08, 0.02, x + o * 0.6, SLATS - 0.07, z );
				batch.add( M.led, place( new CircleGeometry( 0.032, 12 ), x + o, SLATS - 0.222, z, 0, Math.PI / 2 ) );
			} );
		}
	}
}

/** Living walls at the end of every aisle and along the left side, with a bench before it. */
function featureLiving( { batch, M, L, S } ) {
	const depth = L.dBack;
	const zMid = -( L.d1 + L.d2 ) / 2;
	const zones = [];
	const obstacles = [];
	for ( let i = 0; i < L.n; i++ ) {
		livingPanel( batch, M, true, -depth, L.aisleX( i ), 2.8, 1 );
		zones.push( { wall: 'back', from: L.aisleX( i ) - 1.55, to: L.aisleX( i ) + 1.55 } );
	}
	livingPanel( batch, M, false, L.xMin, ( L.d1 + L.d2 ) / 2, L.length, 1 );
	zones.push( { wall: 'left', from: L.d1 - 0.25, to: L.d2 + 0.25 } );

	// A slatted oak bench between two stone planters.
	if ( S.decor.bench ) {
		const bx = L.xMin + 0.34;
		batch.box( M.stone, 0.62, 0.55, 1.0, bx, 0.275, -( L.d1 + 0.55 ) );
		batch.box( M.stone, 0.62, 0.55, 1.0, bx, 0.275, -( L.d2 - 0.55 ) );
		[ L.d1 + 0.55, L.d2 - 0.55 ].forEach( ( d ) => {
			plant( batch, M.leaf, bx, 0.5, -d - 0.22, 0.7, 0.75, false );
			plant( batch, M.leaf, bx, 0.5, -d + 0.22, 0.65, 0.65, false );
		} );
		const benchLen = L.length - 2.3;
		batch.box( M.oakDark, 0.5, 0.38, benchLen, bx, 0.19, zMid );
		for ( let s = -0.2; s <= 0.21; s += 0.08 ) {
			batch.box( M.oak, 0.065, 0.05, benchLen + 0.04, bx + s, 0.41, zMid );
		}
		batch.box( M.led, 0.02, 0.01, benchLen, bx + 0.26, 0.03, zMid );
		shadow( batch, M, bx, zMid, 0.9, L.length + 0.2 );
		obstacles.push( { minX: L.xMin, maxX: L.xMin + 0.68, minZ: -L.d2, maxZ: -L.d1 } );
	}
	return { zones, obstacles };
}

/** Oak slats on the walls asked for, leaving the door opening and the features' stretches clear. */
function wallsSlats( { batch, M, L, S, opts, zones, walls } ) {
	const runs = wallRuns( L, walls );
	if ( opts.mobile ) {
		// Phones: each free stretch of wall is one plane showing the slats as a picture.
		const material = slatPictureMaterial( M, S );
		runs.forEach( ( { wall, alongX, fixed, from, to, inward } ) => {
			slatWall( batch, M, alongX, fixed, from, to, inward, () => true ); // The dark backing only.
			freeStretches( from, to, zones.filter( ( z ) => z.wall === wall ) ).forEach( ( [ a, b ] ) => slatPlane( batch, material, alongX, fixed, a, b, inward, 0.11 ) );
		} );
		return;
	}
	const skip = ( wall ) => ( t ) => zones.some( ( z ) => z.wall === wall && t > z.from && t < z.to );
	runs.forEach( ( r ) => slatWall( batch, M, r.alongX, r.fixed, r.from, r.to, r.inward, skip( r.wall ) ) );
}

/** Gondola dressing: oak cabinetry, backlit shelves, sage ends, a green fascia, plants on top. */
function shelvingOak( { batch, M, L, S, group, opts, accent } ) {
	const zMid = -( L.d1 + L.d2 ) / 2;
	const H = SHELF.height;
	const back = new MeshStandardMaterial( {
		map: toTexture( shelfBackCanvas( S, SHELF.levels, SHELF.height, false ), [ L.bays, 1 ] ),
		emissive: 0xffffff,
		emissiveMap: toTexture( shelfBackCanvas( S, SHELF.levels, SHELF.height, true ), [ L.bays, 1 ] ),
		emissiveIntensity: S.glow.intensity,
		roughness: 0.6
	} );
	for ( let k = 0; k <= L.n; k++ ) {
		const x = L.gondolaX( k );
		const leftSection = k > 0 ? opts.sections[ k - 1 ] : null; // Face towards -x.
		const rightSection = k < L.n ? opts.sections[ k ] : null; // Face towards +x.

		batch.box( M.black, SHELF.depth - 0.04, 0.1, L.length, x, 0.05, zMid );
		batch.add( back, new BoxGeometry( 0.05, H, L.length ).translate( x, H / 2, zMid ) );
		[ [ leftSection, -1 ], [ rightSection, 1 ] ].forEach( ( [ section, dir ] ) => {
			const fx = x + dir * ( SHELF.depth / 4 + 0.012 );
			const edge = x + dir * ( SHELF.depth / 2 );
			// Fascia above the shelves on both faces.
			batch.box( M.green, 0.03, 0.22, L.length, edge, H + 0.11, zMid );
			if ( ! section ) {
				// Outer face of an end gondola: a painted panel instead of empty shelves.
				batch.box( M.sage, 0.03, H - 0.1, L.length, edge - dir * 0.015, H / 2 + 0.05, zMid );
				return;
			}
			SHELF.levels.forEach( ( y ) => {
				batch.box( M.shelf, SHELF.depth / 2 - 0.03, 0.03, L.length, fx, y - 0.015, zMid );
				batch.box( M.oakDark, 0.012, 0.045, L.length, edge - dir * 0.006, y - 0.025, zMid );
				batch.box( M.led, 0.02, 0.006, L.length, edge - dir * 0.06, y - 0.034, zMid );
			} );
			batch.box( M.led, 0.02, 0.006, L.length, edge - dir * 0.06, H - 0.004, zMid );
			// Oak dividers between bays.
			for ( let b = 1; b < L.bays; b++ ) {
				batch.box( M.shelf, SHELF.depth / 2 - 0.03, H - 0.1, 0.025, fx, H / 2 + 0.05, -( L.d1 + b * SHELF.bay ) );
			}
			// The section name on the fascia, in proportion so the serif text is never stretched.
			const plaqueW = Math.min( L.length - 0.4, 2.6 );
			group.add( texturedPlane( plaqueW, 0.2, plaqueCanvas( S, section.label, 2048, Math.round( 2048 * 0.2 / plaqueW ), section.accent || accent ), edge + dir * 0.017, H + 0.11, zMid, dir * Math.PI / 2 ) );
		} );
		// Oak crown, sage end panels facing the cross-aisles.
		batch.box( M.shelf, SHELF.depth + 0.06, 0.04, L.length + 0.14, x, H + 0.24, zMid );
		[ L.d1, L.d2 ].forEach( ( d, i ) => {
			const z = -d + ( i ? -0.035 : 0.035 );
			batch.box( M.sage, SHELF.depth + 0.08, H + 0.26, 0.07, x, ( H + 0.26 ) / 2, z );
			batch.box( M.shelf, SHELF.depth + 0.1, 0.06, 0.09, x, 0.03, z );
			// Oak edge trims frame the painted end panel.
			[ -1, 1 ].forEach( ( s ) => batch.box( M.shelf, 0.035, H + 0.26, 0.085, x + s * ( SHELF.depth / 2 + 0.04 ), ( H + 0.26 ) / 2, z ) );
			// A potted plant on top at each end.
			if ( S.decor.gondolaPlants ) {
				const pz = -d + ( i ? 0.55 : -0.55 );
				batch.add( M.stone, new CylinderGeometry( 0.15, 0.11, 0.24, 16 ).translate( x, H + 0.38, pz ) );
				plant( batch, M.leaf, x, H + 0.44, pz, 0.6, 0.62, false );
			}
		} );
	}
}

registerStyle( 'ceiling', BUILT_IN.ceiling, ceilingSlats );
registerStyle( 'walls', BUILT_IN.walls, wallsSlats );
registerStyle( 'feature', BUILT_IN.feature, featureLiving );
registerStyle( 'shelving', BUILT_IN.shelving, shelvingOak );
registerStyle( 'floor', BUILT_IN.floor, ( { S } ) => floorCanvas( S ) );

/** What a style builder may use, so add-ons need no copy of three.js or of these helpers. */
export const HELPERS = Object.freeze( {
	SHELF,
	SLATS,
	CEIL,
	place,
	plant,
	shadow,
	slatWall,
	wallRuns,
	wallPlane,
	freeStretches,
	livingPanel,
	uvScale,
	texturedPlane,
	plaqueCanvas,
	toTexture,
	// Hanging things on the walls (see walls.js).
	WALL,
	wallSpots,
	spotZone,
	wallBox,
	onWall,
	// Effects (a robot dissolving into ash) need points, a shader and vectors too; video screens
	// need canvas and video textures, and CSS3DObject for HTML laid over the store (addHtml).
	three: Object.freeze( { BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CapsuleGeometry, CircleGeometry, Color, CSS3DObject, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Points, ShaderMaterial, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3, VideoTexture } )
} );

const finite = ( v ) => typeof v === 'number' && Number.isFinite( v );

/**
 * Build one part in its skin's style. The builder works on its own batch and group, which
 * join the store only when it succeeds; a failing add-on style is replaced by Boutique's.
 */
function runStyle( kind, ctx, obstacles, zones, name = ctx.S.styles[ kind ], extra = {} ) {
	const { builder, fallback } = styleFor( kind, name );
	const attempt = ( fn ) => {
		const local = { batch: new Batch(), group: new Group() };
		const out = fn( Object.assign( {}, ctx, extra, local, { zones: zones.slice() } ) ) || {};
		return Object.assign( local, { out } );
	};
	let done;
	try {
		done = attempt( builder );
	} catch ( error ) {
		if ( builder === fallback ) {
			throw error;
		}
		console.warn( 'Aisleza: the "' + name + '" ' + kind + ' style failed; using the built-in one.', error ); // eslint-disable-line no-console
		done = attempt( fallback );
	}
	absorbParts( ctx, done, obstacles, zones );
}

/** Join a builder's own batch and group to the store, with the floor space and wall zones it reported. */
function absorbParts( ctx, done, obstacles, zones ) {
	ctx.batch.absorb( done.batch );
	ctx.group.add( done.group );
	( Array.isArray( done.out.obstacles ) ? done.out.obstacles : [] ).forEach( ( o ) => {
		if ( o && finite( o.minX ) && finite( o.maxX ) && finite( o.minZ ) && finite( o.maxZ ) && o.minX <= o.maxX && o.minZ <= o.maxZ ) {
			obstacles.push( { minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ } );
		}
	} );
	( Array.isArray( done.out.zones ) ? done.out.zones : [] ).forEach( ( z ) => {
		if ( z && [ 'back', 'front', 'left', 'right' ].includes( z.wall ) && finite( z.from ) && finite( z.to ) ) {
			zones.push( { wall: z.wall, from: z.from, to: z.to } );
		}
	} );
}

/**
 * The walls in the skin's walls style, with the colours it may use (finish = { colour, joint }).
 * An entrance wall with its own style or colours is drawn by a second run over that wall only.
 */
function buildWalls( ctx, obstacles, zones ) {
	const S = ctx.S;
	const W = S.walls;
	const main = { colour: W.colour, joint: W.joint };
	const door = { colour: W.entranceColour, joint: W.entranceJoint };
	if ( S.styles.entrance === S.styles.walls && door.colour === main.colour && door.joint === main.joint ) {
		runStyle( 'walls', ctx, obstacles, zones, S.styles.walls, { walls: WALLS.slice(), finish: main } );
		return;
	}
	runStyle( 'walls', ctx, obstacles, zones, S.styles.walls, { walls: [ 'back', 'left', 'right' ], finish: main } );
	runStyle( 'walls', ctx, obstacles, zones, S.styles.entrance, { walls: [ 'front' ], finish: door } );
}

/**
 * The floor's picture in the skin's floor style. An add-on's builder returns a canvas; anything
 * else, or a builder that throws, gives Boutique's stone floor.
 */
function floorPicture( S ) {
	const { builder, fallback } = styleFor( 'floor', S.styles.floor );
	const ok = ( c ) => c && typeof c.getContext === 'function' && c.width > 0 && c.height > 0;
	if ( builder !== fallback ) {
		try {
			const canvas = builder( { S, helpers: HELPERS } );
			if ( ok( canvas ) ) {
				return canvas;
			}
		} catch ( error ) {
			console.warn( 'Aisleza: floor style "' + S.styles.floor + '" failed; using the built-in floor.', error ); // eslint-disable-line no-console
		}
	}
	return fallback( { S, helpers: HELPERS } );
}

/**
 * Build the static store. Returns { group, obstacles, floor, counters }.
 * obstacles are world-space AABBs { minX, maxX, minZ, maxZ } for collision.
 */
export function buildStore( L, opts ) {
	const g = new Group();
	const obstacles = [];
	const batch = new Batch();
	// Lite mode: no trailing plants or plants on the gondolas (leaf cards are drawn through their
	// transparent parts, which weak graphics chips feel most); the trees and the rest stay.
	const S = opts.lite ? Object.assign( {}, opts.skin, { decor: Object.assign( {}, opts.skin.decor, { hangingPlants: false, gondolaPlants: false } ) } ) : opts.skin;
	const M = materials( S );
	const accent = opts.accent;
	const width = L.xMax - L.xMin;
	const cx = ( L.xMin + L.xMax ) / 2;
	const depth = L.dBack;
	const zMid = -( L.d1 + L.d2 ) / 2;

	/* Floor: stone tiles (two per texture repeat). */
	const tile = S.floor.tile * 2;
	const floorTex = toTexture( floorPicture( S ), [ width / tile, depth / tile ] );
	const floor = new Mesh( new PlaneGeometry( width, depth ), new MeshStandardMaterial( { map: floorTex, roughness: S.floor.roughness, metalness: 0 } ) );
	floor.rotation.x = -Math.PI / 2;
	floor.position.set( cx, 0, -depth / 2 );
	floor.userData.floor = true;
	g.add( floor );

	/*
	 * The four style parts (D14). The feature runs first: it reports the stretches of wall it
	 * occupies, which the walls then leave clear.
	 */
	const zones = [];
	const ctx = { batch, M, L, S, group: g, opts, accent, helpers: HELPERS };
	runStyle( 'feature', ctx, obstacles, zones );
	buildWalls( ctx, obstacles, zones );
	runStyle( 'ceiling', ctx, obstacles, zones );
	runStyle( 'shelving', ctx, obstacles, zones );

	const doorX = L.start.x;

	// Olive trees in the corners and either side of the doors.
	if ( S.decor.trees ) {
		[
			[ L.xMin + 0.75, 1.1 ],
			[ L.xMin + 0.75, depth - 0.75 ],
			[ L.xMax - 0.75, depth - 0.75 ],
			[ doorX - 2.75, 0.95 ],
			[ doorX + 2.75, 0.95 ]
		].forEach( ( p ) => obstacles.push( oliveTree( batch, M, p[ 0 ], p[ 1 ] ) ) );
	}

	/* Entrance: black-framed glass doors with the street beyond, the store name above. */
	batch.add( M.outside, place( new PlaneGeometry( 4.2, 3.0 ), doorX, 1.5, 0.3, Math.PI ) );
	[ -1.05, 0, 1.05 ].forEach( ( off ) => batch.box( M.black, 0.06, 2.7, 0.08, doorX + off * 2, 1.35, -0.04 ) );
	batch.box( M.black, 4.26, 0.08, 0.08, doorX, 2.7, -0.04 );
	batch.box( M.black, 4.26, 0.05, 0.08, doorX, 0.025, -0.04 );
	[ -1.05, 1.05 ].forEach( ( off ) => batch.box( M.glass, 2.04, 2.6, 0.02, doorX + off, 1.35, -0.04 ) );
	batch.box( M.plaster, 4.4, SLATS - 2.74, 0.04, doorX, ( SLATS + 2.74 ) / 2, -0.02 );
	const doorSign = texturedPlane( 3.6, 0.56, plaqueCanvas( S, opts.storeName, 1280, 200 ), doorX, 3.08, -0.05, Math.PI );
	g.add( doorSign );
	obstacles.push( { minX: L.xMin - 1, maxX: L.xMax + 1, minZ: -0.5, maxZ: 1 } ); // Front wall line.

	/* Gondolas: the footprint, shadow and collision are the engine's; the dressing is the style's. */
	for ( let k = 0; k <= L.n; k++ ) {
		const x = L.gondolaX( k );
		shadow( batch, M, x, zMid, SHELF.depth + 0.9, L.length + 0.9 );
		obstacles.push( { minX: x - SHELF.depth / 2, maxX: x + SHELF.depth / 2, minZ: -L.d2 - 0.05, maxZ: -L.d1 + 0.05 } );

		// Trailing plants hang over the front walkway at every other gondola.
		if ( S.decor.hangingPlants && k % 2 === 0 ) {
			const z = -( L.d1 - 1.1 );
			batch.box( M.black, 0.012, SLATS - 2.95, 0.012, x, ( SLATS + 2.95 ) / 2, z );
			batch.add( M.stone, new CylinderGeometry( 0.2, 0.13, 0.2, 16 ).translate( x, 2.92, z ) );
			plant( batch, M.leaf, x, 2.95, z, 0.75, 0.55, true );
			plant( batch, M.leaf, x, 2.98, z, 0.5, 0.35, false );
		}
	}

	/*
	 * Add-on fixtures (registerFixture), each on its own batch and group: a failing one is left
	 * out whole. A shelf end ('front' faces the entrance, 'back' the back wall) has one use.
	 */
	const ends = new Set();
	const displays = [];
	const clickables = [];
	fixtures().forEach( ( { name, builder } ) => {
		const claimed = [];
		const claimEnd = ( gondola, end ) => {
			const key = gondola + end;
			if ( ! Number.isInteger( gondola ) || gondola < 0 || gondola > L.n || ( 'front' !== end && 'back' !== end ) || ends.has( key ) ) {
				return false;
			}
			ends.add( key );
			claimed.push( key );
			return true;
		};
		const local = { batch: new Batch(), group: new Group() };
		try {
			const out = builder( Object.assign( {}, ctx, local, { zones: zones.slice(), config: opts.config || {}, claimEnd, store: opts.store || null } ) ) || {};
			absorbParts( ctx, Object.assign( local, { out } ), obstacles, zones );
			( Array.isArray( out.displays ) ? out.displays : [] ).forEach( ( d ) => {
				const display = displayOf( name, d );
				if ( display && ! displays.some( ( x ) => x.key === display.key ) ) {
					displays.push( display );
				}
			} );
			// Clickable parts: { object (in the fixture's group), onClick, onHover }; Enter works on them too.
			( Array.isArray( out.clickables ) ? out.clickables : [] ).forEach( ( c ) => {
				if ( c && c.object && c.object.isObject3D && typeof c.onClick === 'function' ) {
					c.object.traverse( ( o ) => {
						if ( o.isMesh ) {
							o.userData.addonClick = c.onClick;
							if ( typeof c.onHover === 'function' ) {
								o.userData.addonHover = c.onHover; // Called with true when the mouse comes over it, false when it leaves.
							}
							clickables.push( o );
						}
					} );
				}
			} );
		} catch ( error ) {
			claimed.forEach( ( key ) => ends.delete( key ) );
			console.warn( 'Aisleza: the "' + name + '" fixture failed and was left out.', error ); // eslint-disable-line no-console
		}
	} );

	/* Hanging aisle signs over each aisle entrance (and its back end), readable both ways. */
	opts.sections.forEach( ( section, i ) => {
		const x = L.aisleX( i );
		const c = signCanvas( S, i + 1, section.label, section.accent || accent );
		[ -L.d1 + 0.6, -L.d2 - 0.6 ].forEach( ( z ) => {
			batch.box( M.green, 2.3, 0.58, 0.04, x, 2.95, z );
			g.add( texturedPlane( 2.3, 0.575, c, x, 2.95, z + 0.021, 0 ) );
			g.add( texturedPlane( 2.3, 0.575, c, x, 2.95, z - 0.021, Math.PI ) );
			[ -0.9, 0.9 ].forEach( ( o ) => batch.box( M.black, 0.012, SLATS - 3.24, 0.012, x + o, ( SLATS + 3.24 ) / 2, z ) );
		} );
	} );

	/* Checkout lanes near the exit. */
	const counters = [];
	const lenD = L.counterD[ 1 ] - L.counterD[ 0 ];
	const midZ = -( L.counterD[ 0 ] + L.counterD[ 1 ] ) / 2;
	const counterBox = ( w, h, d, material, x, y, z ) => {
		const m = new Mesh( new BoxGeometry( w, h, d ), material );
		m.position.set( x, y, z );
		m.userData.counter = true;
		return m;
	};
	L.lanes.forEach( ( x ) => {
		const cg = new Group();
		cg.add( counterBox( 0.8, 0.86, lenD, M.oak, x, 0.43, midZ ) );
		cg.add( counterBox( 0.86, 0.04, lenD + 0.04, M.counterTop, x, 0.88, midZ ) );
		cg.add( counterBox( 0.5, 0.02, lenD * 0.6, M.belt, x, 0.91, midZ - lenD * 0.15 ) );
		cg.add( counterBox( 0.36, 0.3, 0.3, M.black, x, 1.05, -L.counterD[ 0 ] - 0.3 ) );
		cg.add( counterBox( 0.3, 0.16, 0.01, M.screen, x, 1.12, -L.counterD[ 0 ] - 0.144 ) );
		g.add( cg );
		counters.push( cg );
		shadow( batch, M, x, midZ, 1.4, lenD + 0.6 );
		obstacles.push( { minX: x - 0.45, maxX: x + 0.45, minZ: -L.counterD[ 1 ], maxZ: -L.counterD[ 0 ] } );
	} );
	// The CHECKOUT plaque hangs over the exit end of the lanes, readable from the aisles.
	const lamp = plaqueCanvas( S, opts.labels.checkout, 1024, 200 );
	batch.box( M.green, 2.6, 0.5, 0.03, L.laneX, 2.6, -L.counterD[ 0 ] + 0.59 );
	g.add( texturedPlane( 2.6, 0.5, lamp, L.laneX, 2.6, -L.counterD[ 0 ] + 0.607, 0 ) );
	g.add( texturedPlane( 2.6, 0.5, lamp, L.laneX, 2.6, -L.counterD[ 0 ] + 0.573, Math.PI ) );
	[ -1, 1 ].forEach( ( o ) => batch.box( M.black, 0.012, SLATS - 2.85, 0.012, L.laneX + o, ( SLATS + 2.85 ) / 2, -L.counterD[ 0 ] + 0.59 ) );

	batch.flush( g );
	return { group: g, obstacles, floor, counters, doorSign, displays, clickables };
}

export { inkOn };
