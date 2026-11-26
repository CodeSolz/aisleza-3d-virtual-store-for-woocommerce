/**
 * Lite mode: a lighter 3D store for weak devices, chosen automatically (no setting).
 *
 * Before the store is built, liteDevice() looks at what the browser tells about the device: little memory
 * (navigator.deviceMemory, Chrome and Android) or few processor cores, the data saver or a slow connection,
 * or a software or old graphics chip. A store that still draws slowly at its lowest sharpness switches to
 * lite while the shopper walks (main.js) and remembers that here for 30 days, which also covers devices
 * that tell nothing, like iPhones.
 *
 * For testing: ?aisleza_lite=1 or ?aisleza_lite=0 on the store page forces it for that page, and
 * localStorage 'aisleza:lite' = '1' / '0' forces it on the device (automated tests use '0').
 */

const KEY = 'aisleza:lite';
const REMEMBER = 30 * 24 * 3600 * 1000;

/** Graphics chips that draw a full store too slowly: software renderers and old mobile chips. */
const WEAK_GPU = /swiftshader|llvmpipe|softpipe|software|basic render|mali-[24]\d\d\b|mali-t[67]\d\d|adreno[^0-9]*[1-4]\d\d\b|powervr sgx|powervr rogue g[0-9]{3,4}\b|intel.*(gma|hd graphics [2-4]\d{3}\b)/i;

function stored() {
	try {
		return window.localStorage.getItem( KEY );
	} catch ( e ) {
		return null;
	}
}

function forced() {
	const q = /[?&]aisleza_lite=([01])\b/.exec( window.location.search || '' );
	if ( q ) {
		return '1' === q[ 1 ];
	}
	const v = stored();
	if ( '1' === v || '0' === v ) {
		return '1' === v;
	}
	return null;
}

/** What the graphics chip calls itself, or '' (the browser may not say). */
function gpuName() {
	try {
		const c = document.createElement( 'canvas' );
		const gl = c.getContext( 'webgl' ) || c.getContext( 'experimental-webgl' );
		if ( ! gl ) {
			return '';
		}
		const info = gl.getExtension( 'WEBGL_debug_renderer_info' );
		const name = String( ( info && gl.getParameter( info.UNMASKED_RENDERER_WEBGL ) ) || gl.getParameter( gl.RENDERER ) || '' );
		const lose = gl.getExtension( 'WEBGL_lose_context' );
		if ( lose ) {
			lose.loseContext(); // Browsers allow only a few live contexts: give this one back at once.
		}
		return name;
	} catch ( e ) {
		return '';
	}
}

let device = null; // What the device itself says (asked once a page: it opens a graphics context).

/** Why this device gets the lite store ('' = it doesn't). */
export function liteReason() {
	const f = forced();
	if ( null !== f ) {
		return f ? 'forced' : '';
	}
	const v = stored();
	if ( v && /^auto:\d+$/.test( v ) && Date.now() - parseInt( v.slice( 5 ), 10 ) < REMEMBER ) {
		return 'slow'; // It drew too slowly on an earlier visit.
	}
	if ( null === device ) {
		device = deviceReason();
	}
	return device;
}

function deviceReason() {
	const nav = window.navigator || {};
	const conn = nav.connection || {};
	if ( conn.saveData ) {
		return 'save-data';
	}
	if ( /^(slow-2g|2g|3g)$/.test( conn.effectiveType || '' ) ) {
		return 'connection';
	}
	const memory = nav.deviceMemory || 0;
	const cores = nav.hardwareConcurrency || 0;
	if ( ( memory && memory <= 2 ) || ( cores && cores <= 2 ) || ( memory && memory <= 4 && cores && cores <= 4 ) ) {
		return 'device';
	}
	if ( WEAK_GPU.test( gpuName() ) ) {
		return 'graphics';
	}
	return '';
}

/** Remember that this device draws the full store too slowly (unless a test forced the full store). */
export function rememberSlow() {
	if ( null !== forced() ) {
		return;
	}
	try {
		window.localStorage.setItem( KEY, 'auto:' + Date.now() );
	} catch ( e ) {}
}
