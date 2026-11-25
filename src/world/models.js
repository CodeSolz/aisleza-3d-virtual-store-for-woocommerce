/**
 * 3D products: an add-on tells the store which products have a 3D model (a binary glTF, .glb), and the
 * shelves show the model in that product's slots instead of the photo box.
 *
 *   world.registerProductModels( ( product ) => url | null );
 *
 * product is the Store API product the shelf holds. Each model loads once per address, is scaled to fit
 * a shelf slot (keeping its proportions), stands on the shelf facing the aisle, and stays clickable
 * like the box. A model that fails to load leaves the photo box in place.
 */
import { Box3, Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';

let finder = null;
const cache = new Map(); // url → Promise<{ scene, size }>

/** Set the add-on's function that names a product's model (the last one registered wins). */
export function registerProductModels( fn ) {
	if ( typeof fn !== 'function' ) {
		return false;
	}
	finder = fn;
	return true;
}

/** The model address for a product, or null. Only http(s) and same-site addresses. */
export function modelFor( product ) {
	if ( ! finder || ! product ) {
		return null;
	}
	try {
		const url = finder( product );
		return typeof url === 'string' && /^(https?:\/\/|\/)[^\s"'<>]+$/i.test( url ) ? url : null;
	} catch ( e ) {
		return null;
	}
}

/** Load a model once: centred on x and z, standing on y = 0, with its size. */
export function loadModel( url ) {
	if ( ! cache.has( url ) ) {
		cache.set( url, new Promise( ( resolve, reject ) => {
			new GLTFLoader().load( url, ( gltf ) => {
				const scene = gltf.scene || ( gltf.scenes && gltf.scenes[ 0 ] );
				if ( ! scene ) {
					reject( new Error( 'No scene' ) );
					return;
				}
				const box = new Box3().setFromObject( scene );
				const size = box.getSize( new Vector3() );
				if ( ! ( size.x > 0 && size.y > 0 && size.z > 0 ) ) {
					reject( new Error( 'Empty model' ) );
					return;
				}
				const centre = box.getCenter( new Vector3() );
				scene.position.set( -centre.x, -box.min.y, -centre.z );
				resolve( { scene, size } );
			}, undefined, reject );
		} ) );
	}
	return cache.get( url );
}

/**
 * A model as a USDZ file (a Blob), for AR Quick Look on iPhone and iPad, which reads USDZ, not glTF. Made in
 * the browser from the same .glb (real size, standing on the floor); cached per address.
 */
const usdz = new Map();
export function toUsdz( url ) {
	if ( typeof url !== 'string' || ! /^(https?:\/\/|\/)[^\s"'<>]+$/i.test( url ) ) {
		return Promise.reject( new Error( 'Bad model address' ) );
	}
	if ( ! usdz.has( url ) ) {
		usdz.set( url, loadModel( url ).then( ( model ) => {
			const wrap = new Group();
			wrap.add( model.scene.clone( true ) );
			return new USDZExporter().parseAsync( wrap, { quickLookCompatible: true } );
		} ).then( ( bytes ) => new Blob( [ bytes ], { type: 'model/vnd.usdz+zip' } ) ).catch( ( e ) => {
			usdz.delete( url ); // Try again next time.
			throw e;
		} ) );
	}
	return usdz.get( url );
}

/** A copy of a loaded model scaled to fit w × h × d (uniformly), standing on y = 0. Shares geometry and materials. */
export function fitted( model, w, h, d ) {
	const k = Math.min( w / model.size.x, h / model.size.y, d / model.size.z );
	const wrap = new Group();
	wrap.add( model.scene.clone( true ) );
	wrap.scale.setScalar( k );
	return wrap;
}
