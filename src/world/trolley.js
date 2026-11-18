/**
 * The shopper's trolley, pushed in front of the camera: a tapered wire basket in brushed
 * steel with dark plastic corner caps, a handle bar in the merchant's accent engraved with the
 * store name, a lower wire rack, swivel casters and soft contact shadows. Its basket shows the
 * real cart lines as neat product cards (the catalog thumbnail on a shallow white package).
 *
 * All wires are merged into one mesh, so the trolley costs a handful of draw calls.
 */
import {
	BoxGeometry,
	CylinderGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	PMREMGenerator,
	Quaternion,
	Vector3
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { fitBox, loadImage, makeCanvas, toTexture } from './textures.js';

// Basket: rim at the top, a smaller floor towards the handle (+z), like a real trolley.
const TOP = { w: 0.58, front: -0.42, back: 0.4, y: 0.98 };
const FLOOR = { w: 0.5, front: -0.26, back: 0.4, y: 0.56 };
const WIRE = 0.0042;
const RIM = 0.009;

const UP = new Vector3( 0, 1, 0 );

/** A thin cylinder from a to b, as a geometry ready to merge. */
function rod( a, b, r ) {
	const dir = new Vector3().subVectors( b, a );
	const len = dir.length();
	const g = new CylinderGeometry( r, r, len, 5, 1, true );
	const q = new Quaternion().setFromUnitVectors( UP, dir.clone().normalize() );
	g.applyQuaternion( q );
	const mid = new Vector3().addVectors( a, b ).multiplyScalar( 0.5 );
	g.translate( mid.x, mid.y, mid.z );
	return g;
}

const lerp = ( a, b, t ) => a + ( b - a ) * t;

/** Point on the basket wall: side ±1 (x), u along the length 0..1 (front→back), v height 0..1. */
function sidePoint( side, u, v ) {
	const z = lerp( lerp( FLOOR.front, FLOOR.back, u ), lerp( TOP.front, TOP.back, u ), v );
	const x = side * lerp( FLOOR.w / 2, TOP.w / 2, v );
	return new Vector3( x, lerp( FLOOR.y, TOP.y, v ), z );
}

/** Point on the front (end = -1) or back (end = 1) wall: s across -1..1, v height. */
function endPoint( end, s, v ) {
	const half = lerp( FLOOR.w / 2, TOP.w / 2, v );
	const z = end < 0 ? lerp( FLOOR.front, TOP.front, v ) : lerp( FLOOR.back, TOP.back, v );
	return new Vector3( s * half, lerp( FLOOR.y, TOP.y, v ), z );
}

function wires() {
	const g = [];
	const lenTop = TOP.back - TOP.front;
	// Side walls: dense vertical wires and four horizontal rails.
	[ -1, 1 ].forEach( ( side ) => {
		const n = Math.round( lenTop / 0.034 );
		for ( let k = 0; k <= n; k++ ) {
			g.push( rod( sidePoint( side, k / n, 0 ), sidePoint( side, k / n, 1 ), WIRE ) );
		}
		[ 0.25, 0.5, 0.75 ].forEach( ( v ) => g.push( rod( sidePoint( side, 0, v ), sidePoint( side, 1, v ), WIRE * 1.2 ) ) );
	} );
	// Front and back walls.
	[ -1, 1 ].forEach( ( end ) => {
		const n = Math.round( TOP.w / 0.034 );
		for ( let k = 0; k <= n; k++ ) {
			const s = -1 + ( 2 * k ) / n;
			g.push( rod( endPoint( end, s, 0 ), endPoint( end, s, 1 ), WIRE ) );
		}
		[ 0.25, 0.5, 0.75 ].forEach( ( v ) => g.push( rod( endPoint( end, -1, v ), endPoint( end, 1, v ), WIRE * 1.2 ) ) );
	} );
	// Floor grid.
	const fl = FLOOR.back - FLOOR.front;
	for ( let k = 0; k <= Math.round( fl / 0.034 ); k++ ) {
		const z = FLOOR.front + ( k * fl ) / Math.round( fl / 0.034 );
		g.push( rod( new Vector3( -FLOOR.w / 2, FLOOR.y, z ), new Vector3( FLOOR.w / 2, FLOOR.y, z ), WIRE ) );
	}
	for ( let k = 0; k <= 6; k++ ) {
		const x = -FLOOR.w / 2 + ( k * FLOOR.w ) / 6;
		g.push( rod( new Vector3( x, FLOOR.y - 0.004, FLOOR.front ), new Vector3( x, FLOOR.y - 0.004, FLOOR.back ), WIRE * 1.3 ) );
	}
	// Rims: top and bottom outlines in thicker tube.
	[ 0, 1 ].forEach( ( v ) => {
		const r = v ? RIM : RIM * 0.8;
		const c = [ sidePoint( -1, 0, v ), sidePoint( 1, 0, v ), sidePoint( 1, 1, v ), sidePoint( -1, 1, v ) ];
		for ( let k = 0; k < 4; k++ ) {
			g.push( rod( c[ k ], c[ ( k + 1 ) % 4 ], r ) );
		}
	} );
	// Chassis: legs, side rails, lower rack.
	const rackY = 0.2;
	const legs = [
		[ sidePoint( -1, 1, 0 ), new Vector3( -0.24, 0.13, 0.36 ) ],
		[ sidePoint( 1, 1, 0 ), new Vector3( 0.24, 0.13, 0.36 ) ],
		[ sidePoint( -1, 0, 0 ), new Vector3( -0.2, 0.13, -0.3 ) ],
		[ sidePoint( 1, 0, 0 ), new Vector3( 0.2, 0.13, -0.3 ) ]
	];
	legs.forEach( ( [ a, b ] ) => g.push( rod( a, b, RIM ) ) );
	[ -1, 1 ].forEach( ( s ) => {
		g.push( rod( new Vector3( s * 0.2, 0.13, -0.3 ), new Vector3( s * 0.24, 0.13, 0.36 ), RIM ) );
		g.push( rod( new Vector3( s * 0.21, rackY, -0.24 ), new Vector3( s * 0.235, rackY, 0.33 ), WIRE * 1.4 ) );
	} );
	for ( let k = 0; k <= 9; k++ ) {
		const z = -0.24 + ( k * 0.57 ) / 9;
		const half = lerp( 0.21, 0.235, k / 9 );
		g.push( rod( new Vector3( -half, rackY, z ), new Vector3( half, rackY, z ), WIRE ) );
	}
	return mergeGeometries( g );
}

/** Gold bar texture with the store name (and logo) engraved, centred on the side facing the shopper. */
function handleTexture( name, accent, logo ) {
	const c = makeCanvas( 512, 1024 ); // u = around the bar, v = along it.
	const ctx = c.getContext( '2d' );
	const grad = ctx.createLinearGradient( 0, 0, 512, 0 );
	grad.addColorStop( 0, accent );
	grad.addColorStop( 0.5, '#f6dc9c' );
	grad.addColorStop( 1, accent );
	ctx.fillStyle = grad;
	ctx.fillRect( 0, 0, 512, 1024 );
	ctx.save();
	ctx.translate( 128, 512 );
	ctx.rotate( Math.PI / 2 );
	ctx.fillStyle = 'rgba(72,48,10,.78)';
	ctx.font = '600 58px "Segoe UI", system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	const words = String( name || '' ).slice( 0, logo ? 18 : 24 );
	if ( logo ) {
		// Logo then name, centred along the bar.
		const box = fitBox( logo, 300, 76 );
		const gap = words ? 22 : 0;
		const total = box.w + gap + ( words ? ctx.measureText( words ).width : 0 );
		ctx.drawImage( logo, -total / 2, -box.h / 2, box.w, box.h );
		ctx.textAlign = 'left';
		ctx.fillText( words, -total / 2 + box.w + gap, 0 );
	} else {
		ctx.fillText( words, 0, 0 );
	}
	ctx.restore();
	return toTexture( c );
}

let envMap = null;

/** A soft studio reflection for the metal parts (generated once; nothing is downloaded). */
function environment( renderer ) {
	if ( ! envMap && renderer ) {
		const pmrem = new PMREMGenerator( renderer );
		envMap = pmrem.fromScene( new RoomEnvironment(), 0.04 ).texture;
		pmrem.dispose();
	}
	return envMap;
}

export function buildTrolley( accent, renderer, storeName ) {
	const env = environment( renderer );
	const g = new Group();
	const steel = new MeshStandardMaterial( { color: 0xd7dade, metalness: 0.92, roughness: 0.28, envMap: env, envMapIntensity: 1.1 } );
	const plastic = new MeshStandardMaterial( { color: 0x2b2e36, metalness: 0.1, roughness: 0.55, envMap: env, envMapIntensity: 0.4 } );
	const rubber = new MeshStandardMaterial( { color: 0x23252b, roughness: 0.85 } );

	g.add( new Mesh( wires(), steel ) );

	// Dark plastic caps on the four top corners.
	[ [ -1, 0 ], [ 1, 0 ], [ -1, 1 ], [ 1, 1 ] ].forEach( ( [ s, u ] ) => {
		const p = sidePoint( s, u, 1 );
		const cap = new Mesh( new BoxGeometry( 0.038, 0.028, 0.038 ), plastic );
		cap.position.set( p.x, p.y, p.z );
		g.add( cap );
	} );

	// Gold handle on dark brackets, behind the basket.
	const handleZ = TOP.back + 0.11;
	const handleY = TOP.y + 0.03;
	const gold = new MeshStandardMaterial( { map: handleTexture( storeName, accent ), metalness: 0.75, roughness: 0.3, envMap: env, envMapIntensity: 1.2 } );
	const bar = new Mesh( new CylinderGeometry( 0.026, 0.026, TOP.w + 0.04, 32 ), gold );
	bar.rotation.z = Math.PI / 2; // The engraving (u = 0.25) ends up on top, facing the shopper.
	bar.position.set( 0, handleY, handleZ );
	g.add( bar );
	[ -1, 1 ].forEach( ( s ) => {
		const end = new Mesh( new CylinderGeometry( 0.03, 0.03, 0.035, 20 ), plastic );
		end.rotation.z = Math.PI / 2;
		end.position.set( s * ( TOP.w / 2 + 0.037 ), handleY, handleZ );
		g.add( end );
		const bracket = new Mesh( new BoxGeometry( 0.026, 0.045, 0.12 ), plastic );
		bracket.position.set( s * ( TOP.w / 2 + 0.006 ), handleY - 0.008, TOP.back + 0.05 );
		g.add( bracket );
	} );

	// Swivel casters: steel fork, dark wheel, bright hub.
	const wheels = [];
	[ [ -0.24, 0.36 ], [ 0.24, 0.36 ], [ -0.2, -0.3 ], [ 0.2, -0.3 ] ].forEach( ( [ x, z ] ) => {
		const fork = new Mesh( new BoxGeometry( 0.05, 0.07, 0.04 ), steel );
		fork.position.set( x, 0.1, z );
		g.add( fork );
		const wheel = new Mesh( new CylinderGeometry( 0.055, 0.055, 0.032, 20 ), rubber );
		wheel.rotation.z = Math.PI / 2;
		wheel.position.set( x, 0.055, z + 0.02 );
		g.add( wheel );
		const hub = new Mesh( new CylinderGeometry( 0.022, 0.022, 0.036, 12 ), steel );
		hub.rotation.z = Math.PI / 2;
		hub.position.copy( wheel.position );
		g.add( hub );
		wheels.push( wheel );
	} );

	// Soft contact shadows: one under the trolley, a darker one under each wheel.
	const soft = new MeshBasicMaterial( { map: shadowTexture( 0.32 ), transparent: true, depthWrite: false } );
	const ground = new Mesh( new PlaneGeometry( 0.78, 1.0 ), soft );
	ground.rotation.x = -Math.PI / 2;
	ground.position.set( 0, 0.004, 0.03 );
	g.add( ground );
	const dark = new MeshBasicMaterial( { map: shadowTexture( 0.55 ), transparent: true, depthWrite: false } );
	wheels.forEach( ( w ) => {
		const spot = new Mesh( new PlaneGeometry( 0.13, 0.13 ), dark );
		spot.rotation.x = -Math.PI / 2;
		spot.position.set( w.position.x, 0.005, w.position.z );
		g.add( spot );
	} );

	const items = new Group();
	g.add( items );
	g.userData = { items, wheels, handle: gold, signature: '' };
	return g;
}

/** Radial soft shadow (alpha fades to nothing at the edge). */
function shadowTexture( strength ) {
	const c = makeCanvas( 128, 128 );
	const ctx = c.getContext( '2d' );
	const grad = ctx.createRadialGradient( 64, 64, 4, 64, 64, 64 );
	grad.addColorStop( 0, 'rgba(20,22,30,' + strength + ')' );
	grad.addColorStop( 1, 'rgba(20,22,30,0)' );
	ctx.fillStyle = grad;
	ctx.fillRect( 0, 0, 128, 128 );
	return toTexture( c );
}

// A product card: a shallow white package carrying the catalog thumbnail on top.
const cardGeo = new BoxGeometry( 0.2, 0.045, 0.24 );
const cardSide = new MeshStandardMaterial( { color: 0xf6f3ee, roughness: 0.85 } );
// Two side by side towards the front, one nearer the handle, then the corners (as in a real trolley).
const SPOTS = [ [ -0.12, -0.1 ], [ 0.12, -0.1 ], [ 0, 0.1 ], [ -0.12, 0.2 ], [ 0.12, 0.2 ] ];

/** Engrave the store logo (a loaded picture) beside the name on the handle. */
export function brandTrolley( trolley, accent, storeName, logo ) {
	const gold = trolley.userData.handle;
	const old = gold.map;
	gold.map = handleTexture( storeName, accent, logo );
	old.dispose();
}

/** Show the cart in the basket: one card per unit (up to 15), stacked in layers inside the rim. */
export function fillTrolley( trolley, items, accent, labels, changed ) {
	const units = [];
	( items || [] ).forEach( ( it ) => {
		for ( let q = 0; q < Math.min( it.quantity, 4 ); q++ ) {
			units.push( it );
		}
	} );
	const signature = units.map( ( u ) => u.key ).join( ',' );
	const holder = trolley.userData.items;
	if ( signature === trolley.userData.signature ) {
		return false;
	}
	trolley.userData.signature = signature;
	holder.children.slice().forEach( ( c ) => {
		holder.remove( c );
		c.material[ 2 ].map.dispose();
		c.material[ 2 ].dispose(); // The sides are shared.
	} );
	units.slice( 0, 15 ).forEach( ( it, n ) => {
		const spot = SPOTS[ n % SPOTS.length ];
		const layer = Math.floor( n / SPOTS.length );
		const canvas = makeCanvas( 192, 230 );
		const ctx = canvas.getContext( '2d' );
		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, 192, 230 );
		const tex = toTexture( canvas );
		const top = new MeshStandardMaterial( { map: tex, roughness: 0.7 } );
		const card = new Mesh( cardGeo, [ cardSide, cardSide, top, cardSide, cardSide, cardSide ] );
		card.position.set( spot[ 0 ], FLOOR.y + 0.026 + layer * 0.047, spot[ 1 ] + 0.04 );
		card.rotation.y = ( ( ( n * 37 ) % 21 ) - 10 ) / 70;
		holder.add( card );
		const img = it.images && it.images[ 0 ];
		loadImage( img ? img.thumbnail || img.src : '' ).then( ( image ) => {
			if ( ! image ) {
				return;
			}
			// The catalog thumbnail, whole ("contain"), on the card with a thin frame.
			const box = 176;
			const k = Math.min( box / image.naturalWidth, 214 / image.naturalHeight );
			const w = image.naturalWidth * k;
			const h = image.naturalHeight * k;
			ctx.drawImage( image, ( 192 - w ) / 2, ( 230 - h ) / 2, w, h );
			ctx.strokeStyle = 'rgba(27,36,64,.18)';
			ctx.lineWidth = 4;
			ctx.strokeRect( 2, 2, 188, 226 );
			tex.needsUpdate = true;
			changed();
		} );
	} );
	return true;
}
