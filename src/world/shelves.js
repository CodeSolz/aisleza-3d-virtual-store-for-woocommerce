/**
 * Stocks an aisle: each product becomes a block of identical "facings" on the shelves (one
 * InstancedMesh per block) wearing its real product image, with a price tag on the shelf lip.
 * Eye-level shelves fill first, from the aisle entrance inwards, like a real supermarket.
 */
import {
	BoxGeometry,
	Color,
	CylinderGeometry,
	DoubleSide,
	InstancedMesh,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PlaneGeometry,
	Quaternion,
	Vector3,
	Group
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHELF } from './scene.js';
import { drawPackaging, loadImage, makeCanvas, plantCanvas, tagCanvas, tint, toTexture } from './textures.js';
import { fitted, loadModel, modelFor } from './models.js';

const boxGeo = new BoxGeometry( SHELF.boxW, SHELF.boxH, SHELF.boxD );
const tagGeo = new PlaneGeometry( 1, 1 );
const UP = new Vector3( 0, 1, 0 );

/*
 * Shelf decor for the space no product needs, so a small catalogue still looks like a styled
 * boutique: vases, pot plants, folded towels, baskets with diffusers and candle jars. Unit
 * shapes (base at y = 0) scaled per instance; decor is never pickable.
 */
const decorGeo = {
	jar: new CylinderGeometry( 0.42, 0.5, 1, 16 ).translate( 0, 0.5, 0 ),
	cube: new BoxGeometry( 1, 1, 1 ).translate( 0, 0.5, 0 ),
	leaves: mergeGeometries( [ 0, 1, 2 ].map( ( k ) => new PlaneGeometry( 1, 1 ).translate( 0, 0.5, 0 ).rotateY( k * Math.PI / 3 + 0.4 ) ) )
};
const DECOR_SETS = [ 'vases', 'plant', 'towels', 'basket', 'candles' ];

export class Shelves {
	constructor( L, opts ) {
		this.L = L;
		this.opts = opts;
		this.aisles = {};
		this.displays = {}; // Featured displays at the aisle ends, by key.
		this.packs = new Map(); // key → { canvas, texture, refs, info, image }
		this.sides = new Map(); // accent → side material
		this.decorMats = null;
	}

	/** Decor materials in the skin's look (made on first use, shared by every aisle). */
	decorMaterials() {
		if ( ! this.decorMats ) {
			this.decorMats = {
				solid: new MeshStandardMaterial( { color: 0xffffff, roughness: 0.6 } ),
				leaves: new MeshStandardMaterial( { map: toTexture( plantCanvas( this.opts.skin, false ) ), alphaTest: 0.5, side: DoubleSide, roughness: 0.8 } )
			};
		}
		return this.decorMats;
	}

	/** Every facing position of aisle i, in fill order. */
	slots( i ) {
		const L = this.L;
		const faces = [
			{ gx: L.gondolaX( i ), dir: 1 },
			{ gx: L.gondolaX( i + 1 ), dir: -1 }
		];
		const out = [];
		SHELF.fill.forEach( ( level ) => {
			faces.forEach( ( face, side ) => {
				for ( let b = 0; b < L.bays; b++ ) {
					for ( let j = 0; j < SHELF.slots; j++ ) {
						const d = L.d1 + b * SHELF.bay + ( j + 0.5 ) * ( SHELF.bay / SHELF.slots );
						out.push( {
							x: face.gx + face.dir * ( SHELF.depth / 2 - 0.05 - SHELF.boxD / 2 ),
							y: SHELF.levels[ level ] + SHELF.boxH / 2,
							z: -d,
							dir: face.dir,
							gx: face.gx,
							level,
							side,
							run: b * SHELF.slots + j
						} );
					}
				}
			} );
		} );
		return out;
	}

	sideMaterial( accent ) {
		if ( ! this.sides.has( accent ) ) {
			this.sides.set( accent, new MeshStandardMaterial( { color: tint( accent, 0.6 ), roughness: 0.8 } ) );
		}
		return this.sides.get( accent );
	}

	/**
	 * 3D products (models.js): when an add-on names a model for this product, it replaces the photo boxes
	 * in the block's slots once it has loaded (the boxes stay if it can't). `alive()` says whether the
	 * shelf still shows this block (the shopper may have walked on and the aisle been emptied).
	 */
	modelise( product, boxes, block, group, pickables, alive ) {
		if ( this.opts.lite && this.opts.lite() ) {
			return; // Lite mode keeps the photo boxes.
		}
		const url = modelFor( product );
		if ( ! url ) {
			return;
		}
		loadModel( url ).then( ( model ) => {
			if ( ! alive() ) {
				return;
			}
			const q = new Quaternion();
			block.forEach( ( slot ) => {
				// A little larger than the box (models have no packaging), standing on the shelf.
				const copy = fitted( model, SHELF.boxW * 1.15, SHELF.boxH * 1.25, SHELF.boxD * 1.15 );
				q.setFromAxisAngle( UP, slot.dir * Math.PI / 2 );
				copy.quaternion.copy( q );
				copy.position.set( slot.x, slot.y - SHELF.boxH / 2, slot.z );
				copy.traverse( ( o ) => {
					if ( o.isMesh ) {
						o.userData.productId = product.id;
						pickables.push( o );
					}
				} );
				group.add( copy );
			} );
			boxes.visible = false;
			const at = pickables.indexOf( boxes );
			if ( at >= 0 ) {
				pickables.splice( at, 1 );
			}
			if ( this.opts.changed ) {
				this.opts.changed();
			}
		} ).catch( () => {
			// The photo boxes stay.
		} );
	}

	/** Packaging texture for a product in a given section colour (shared between facings). */
	pack( product, accent ) {
		const key = product.id + '|' + accent;
		let p = this.packs.get( key );
		if ( ! p ) {
			const canvas = makeCanvas( 256, 320 );
			const info = this.opts.describe( product );
			info.accent = accent;
			p = { canvas, texture: toTexture( canvas ), refs: 0, info, image: null, id: product.id, material: null };
			drawPackaging( canvas, null, info );
			p.material = new MeshStandardMaterial( { map: p.texture, roughness: 0.55 } );
			this.packs.set( key, p );
			const img = product.images && product.images[ 0 ];
			loadImage( img ? img.thumbnail || img.src : '' ).then( ( image ) => {
				if ( ! this.packs.has( key ) ) {
					return;
				}
				p.image = image;
				drawPackaging( canvas, image, p.info );
				p.texture.needsUpdate = true;
				this.opts.changed();
			} );
		}
		p.refs++;
		return p;
	}

	/** Try-on eligibility arrived or changed: redraw that product's stickers. */
	setEligible( id, flag ) {
		this.packs.forEach( ( p ) => {
			if ( p.id === id && p.info.tryon !== flag ) {
				p.info.tryon = flag;
				drawPackaging( p.canvas, p.image, p.info );
				p.texture.needsUpdate = true;
			}
		} );
		this.opts.changed();
	}

	/** The shopper saved or removed a product (the wishlist): redraw its heart. */
	setSaved( id, flag ) {
		this.packs.forEach( ( p ) => {
			if ( p.id === id && !! p.info.saved !== flag ) {
				p.info.saved = flag;
				drawPackaging( p.canvas, p.image, p.info );
				p.texture.needsUpdate = true;
			}
		} );
		this.opts.changed();
	}

	/** Put an aisle's products on its shelves. Returns the meshes the pointer can pick. */
	populate( i, products, accent ) {
		this.release( i );
		const slots = this.slots( i );
		const group = new Group();
		const pickables = [];
		const n = products.length;
		if ( ! n ) {
			this.decorate( slots, group, i );
			this.aisles[ i ] = { group, pickables, packs: [], tags: [] };
			return this.aisles[ i ];
		}
		const facings = Math.max( 1, Math.min( 4, Math.floor( slots.length / n ) ) );
		const side = this.sideMaterial( accent );
		const packs = [];
		const tags = [];
		const m = new Matrix4();
		const q = new Quaternion();
		const s = new Vector3( 1, 1, 1 );
		let cursor = 0;

		products.forEach( ( product ) => {
			if ( cursor >= slots.length ) {
				return;
			}
			const block = slots.slice( cursor, Math.min( slots.length, cursor + facings ) );
			cursor += block.length;
			const p = this.pack( product, accent );
			packs.push( p );
			const mesh = new InstancedMesh( boxGeo, [ side, side, side, side, p.material, side ], block.length );
			block.forEach( ( slot, k ) => {
				q.setFromAxisAngle( UP, slot.dir * Math.PI / 2 );
				m.compose( new Vector3( slot.x, slot.y, slot.z ), q, s );
				mesh.setMatrixAt( k, m );
			} );
			mesh.instanceMatrix.needsUpdate = true;
			mesh.computeBoundingSphere();
			mesh.userData.productId = product.id;
			group.add( mesh );
			pickables.push( mesh );
			this.modelise( product, mesh, block, group, pickables, () => this.aisles[ i ] && this.aisles[ i ].group === group );

			// Price tag under the block (the part of the block on the first shelf run).
			const first = block[ 0 ];
			const run = block.filter( ( sl ) => sl.level === first.level && sl.side === first.side );
			const zMin = Math.min.apply( null, run.map( ( sl ) => sl.z ) );
			const zMax = Math.max.apply( null, run.map( ( sl ) => sl.z ) );
			// Keep the tag's 4:1 proportions so the text is never stretched.
			const width = Math.min( 0.44, ( zMax - zMin ) + SHELF.bay / SHELF.slots - 0.06 );
			const info = this.opts.describe( product );
			const tagTex = toTexture( tagCanvas( info.name, info.price, info.was, accent ) );
			const tag = new Mesh( tagGeo, new MeshBasicMaterial( { map: tagTex, toneMapped: false } ) );
			tag.scale.set( width, width / 4, 1 );
			tag.position.set( first.gx + first.dir * ( SHELF.depth / 2 + 0.004 ), SHELF.levels[ first.level ] - 0.004 - width / 8, ( zMin + zMax ) / 2 );
			tag.rotation.y = first.dir * Math.PI / 2;
			tag.userData.productId = product.id;
			group.add( tag );
			pickables.push( tag );
			tags.push( tag );
		} );

		this.decorate( slots.slice( cursor ), group, i );
		this.aisles[ i ] = { group, pickables, packs, tags };
		return this.aisles[ i ];
	}

	/**
	 * Products on an add-on fixture's display: one facing each, a price tag on the shelf lip below.
	 * Slots come from the fixture (registerFixture). Returns the meshes the pointer can pick.
	 */
	display( key, slots, products, accent ) {
		this.releaseDisplay( key );
		const group = new Group();
		const pickables = [];
		const packs = [];
		const tags = [];
		const side = this.sideMaterial( accent );
		products.slice( 0, slots.length ).forEach( ( product, k ) => {
			const slot = slots[ k ];
			const p = this.pack( product, accent );
			packs.push( p );
			const mesh = new Mesh( boxGeo, [ side, side, side, side, p.material, side ] );
			mesh.position.set( slot.x, slot.y, slot.z );
			mesh.rotation.y = slot.rot;
			mesh.userData.productId = product.id;
			group.add( mesh );
			pickables.push( mesh );
			const info = this.opts.describe( product );
			const tag = new Mesh( tagGeo, new MeshBasicMaterial( { map: toTexture( tagCanvas( info.name, info.price, info.was, accent ) ), toneMapped: false } ) );
			tag.scale.set( 0.4, 0.1, 1 );
			tag.position.set( slot.x, slot.y - SHELF.boxH / 2 - 0.054, slot.edge + slot.face * 0.004 ); // On the shelf lip.
			tag.rotation.y = slot.rot;
			tag.userData.productId = product.id;
			group.add( tag );
			pickables.push( tag );
			tags.push( tag );
		} );
		this.displays[ key ] = { group, pickables, packs, tags };
		return this.displays[ key ];
	}

	/** Free a display's GPU memory. */
	releaseDisplay( key ) {
		const a = this.displays[ key ];
		if ( ! a ) {
			return null;
		}
		this.free( a );
		delete this.displays[ key ];
		return a.group;
	}

	/** Every mesh the pointer can pick, on shelves and displays. */
	pickables() {
		const out = [];
		[ this.aisles, this.displays ].forEach( ( set ) => Object.keys( set ).forEach( ( k ) => out.push.apply( out, set[ k ].pickables ) ) );
		return out;
	}

	/** Style the free slots with decor (a fixed pattern per aisle, so it never shuffles). */
	decorate( free, group, seed ) {
		const round = [];
		const boxes = [];
		const leaves = [];
		const put = ( list, s, along, y, w, h, d, tone ) => list.push( { x: s.x, y, z: s.z + along, w, h, d, tone } );
		const TONES = this.opts.skin.shelfDecor.tones;
		const sets = this.opts.skin.shelfDecor.sets.filter( ( name ) => DECOR_SETS.includes( name ) );
		if ( ! sets.length ) {
			return;
		}
		free.forEach( ( s, k ) => {
			if ( ( k * 13 + seed * 5 ) % 9 === 0 ) {
				return; // A few gaps read as real, styled shelving.
			}
			const y = SHELF.levels[ s.level ];
			switch ( sets[ ( k * 7 + seed * 3 + s.level ) % sets.length ] ) {
				case 'vases': // A tall vase and a small one.
					put( round, s, -0.07, y, 0.13, 0.3, 0.13, TONES.charcoal );
					put( round, s, 0.09, y, 0.1, 0.16, 0.1, TONES.cream );
					break;
				case 'plant': // Pot plant.
					put( round, s, 0, y, 0.15, 0.12, 0.15, TONES.stone );
					put( leaves, s, 0, y + 0.08, 0.34, 0.3, 0.34, null );
					break;
				case 'towels': // Folded towels.
					[ TONES.cream, TONES.sand, TONES.sage ].forEach( ( tone, j ) => put( boxes, s, 0, y + j * 0.055, 0.26, 0.05, 0.2, tone ) );
					break;
				case 'basket': // Basket and a reed diffuser.
					put( round, s, -0.05, y, 0.24, 0.13, 0.22, TONES.wicker );
					put( round, s, 0.12, y, 0.07, 0.17, 0.07, TONES.amber );
					break;
				default: // Candle jars.
					[ [ -0.1, 0.09, TONES.cream ], [ 0, 0.13, TONES.sage ], [ 0.1, 0.07, TONES.charcoal ] ].forEach( ( c ) => put( round, s, c[ 0 ], y, 0.08, c[ 1 ], 0.08, c[ 2 ] ) );
			}
		} );
		const mats = this.decorMaterials();
		[ [ decorGeo.jar, mats.solid, round ], [ decorGeo.cube, mats.solid, boxes ], [ decorGeo.leaves, mats.leaves, leaves ] ].forEach( ( [ geo, material, list ] ) => {
			if ( ! list.length ) {
				return;
			}
			const mesh = new InstancedMesh( geo, material, list.length );
			const m = new Matrix4();
			const color = new Color();
			list.forEach( ( p, k ) => {
				m.makeScale( p.w, p.h, p.d ).setPosition( p.x, p.y, p.z );
				mesh.setMatrixAt( k, m );
				if ( p.tone ) {
					mesh.setColorAt( k, color.set( p.tone ) );
				}
			} );
			mesh.instanceMatrix.needsUpdate = true;
			mesh.computeBoundingSphere();
			group.add( mesh );
		} );
	}

	/**
	 * One of everything a stocked aisle draws (instanced product boxes and their sides, a display
	 * box, a price tag, the decor), with the same kinds of materials, never shown. Compiled while
	 * the store loads, it means the browser builds those shaders then, not in the middle of a walk
	 * (the first stocked aisle used to freeze the store for about 0.2 s). Returns { group, free }.
	 */
	warmup( accent ) {
		const group = new Group();
		const side = this.sideMaterial( accent );
		const texture = toTexture( makeCanvas( 8, 8 ) );
		const pack = new MeshStandardMaterial( { map: texture, roughness: 0.55 } );
		const boxes = new InstancedMesh( boxGeo, [ side, side, side, side, pack, side ], 1 );
		boxes.setMatrixAt( 0, new Matrix4() );
		group.add( boxes );
		group.add( new Mesh( boxGeo, [ side, side, side, side, pack, side ] ) ); // As on a featured display.
		const tagTexture = toTexture( makeCanvas( 8, 8 ) );
		const tag = new MeshBasicMaterial( { map: tagTexture, toneMapped: false } );
		group.add( new Mesh( tagGeo, tag ) );
		this.decorate( this.slots( 0 ).slice( 0, 24 ), group, 0 ); // Every decor material and its tints.
		return {
			group,
			free: () => {
				group.children.forEach( ( c ) => c.isInstancedMesh && c.dispose() );
				texture.dispose();
				pack.dispose();
				tagTexture.dispose();
				tag.dispose();
			}
		};
	}

	/** Free an aisle's GPU memory (far away from the shopper). */
	release( i ) {
		const a = this.aisles[ i ];
		if ( ! a ) {
			return null;
		}
		this.free( a );
		delete this.aisles[ i ];
		return a.group;
	}

	/** Dispose of a stocked group's tags, instanced meshes and unused packaging. */
	free( a ) {
		a.tags.forEach( ( t ) => {
			t.material.map.dispose();
			t.material.dispose();
		} );
		a.group.children.forEach( ( c ) => {
			if ( c.isInstancedMesh ) {
				c.dispose();
			}
		} );
		a.packs.forEach( ( p ) => {
			p.refs--;
			if ( p.refs <= 0 ) {
				p.texture.dispose();
				p.material.dispose();
				this.packs.delete( p.id + '|' + p.info.accent );
			}
		} );
	}
}
