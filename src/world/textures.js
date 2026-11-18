/**
 * Canvas-drawn textures: signs, product packaging, shelf price tags, floor tiles. Everything
 * is generated in the browser from the store's own data; no image assets are shipped. The
 * building's textures take the active skin (S) and draw with its colours.
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { rgba } from './skin.js';

export function makeCanvas( w, h ) {
	const c = document.createElement( 'canvas' );
	c.width = w;
	c.height = h;
	return c;
}

export function toTexture( canvas, repeat ) {
	const t = new CanvasTexture( canvas );
	t.colorSpace = SRGBColorSpace;
	t.anisotropy = 4;
	if ( repeat ) {
		t.wrapS = RepeatWrapping;
		t.wrapT = RepeatWrapping;
		t.repeat.set( repeat[ 0 ], repeat[ 1 ] );
	}
	return t;
}

/** Ink (#1b2440) or white, whichever reads better on the colour. */
export function inkOn( hex ) {
	const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec( hex || '' );
	if ( ! m ) {
		return '#1b2440';
	}
	const lum = [ m[ 1 ], m[ 2 ], m[ 3 ] ].map( ( h ) => {
		const c = parseInt( h, 16 ) / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 );
	} );
	return 0.2126 * lum[ 0 ] + 0.7152 * lum[ 1 ] + 0.0722 * lum[ 2 ] > 0.36 ? '#1b2440' : '#ffffff';
}

/** Mix a colour towards white (amount 0..1). */
export function tint( hex, amount ) {
	const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec( hex || '#d4a24c' );
	const mix = ( h ) => Math.round( parseInt( h, 16 ) + ( 255 - parseInt( h, 16 ) ) * amount ).toString( 16 ).padStart( 2, '0' );
	return m ? '#' + mix( m[ 1 ] ) + mix( m[ 2 ] ) + mix( m[ 3 ] ) : hex;
}

const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif';

/** The sign font a skin asks for ("serif" or "sans"). */
function signFont( S ) {
	return 'sans' === S.fonts.signs ? FONT : SERIF;
}

/** Small deterministic PRNG, so generated textures look the same on every visit. */
function rng( seed ) {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return ( s >>> 0 ) / 4294967296;
	};
}

/** Wood: a base colour (the skin's wall wood unless given) with fine vertical grain. */
export function woodCanvas( S, base ) {
	const c = makeCanvas( 256, 256 );
	const ctx = c.getContext( '2d' );
	const r = rng( 7 );
	ctx.fillStyle = base || S.palette.wood;
	ctx.fillRect( 0, 0, 256, 256 );
	for ( let i = 0; i < 90; i++ ) {
		const x = r() * 256;
		ctx.strokeStyle = r() > 0.5 ? rgba( S.wood.grainDark, 0.08 + r() * 0.16 ) : rgba( S.wood.grainLight, 0.08 + r() * 0.14 );
		ctx.lineWidth = 0.6 + r() * 2.2;
		ctx.beginPath();
		ctx.moveTo( x, 0 );
		ctx.bezierCurveTo( x + ( r() - 0.5 ) * 10, 85, x + ( r() - 0.5 ) * 10, 170, x + ( r() - 0.5 ) * 6, 256 );
		ctx.stroke();
	}
	return c;
}

/**
 * Slats as a picture, for phones: 16 vertical wood slats with dark gaps between them. Drawn
 * flat with mipmaps it stays calm at a distance, where thin slat geometry would shimmer into
 * stripes without antialiasing.
 */
export function slatCanvas( S ) {
	const c = makeCanvas( 512, 128 );
	const ctx = c.getContext( '2d' );
	const wood = woodCanvas( S );
	ctx.fillStyle = S.palette.void;
	ctx.fillRect( 0, 0, 512, 128 );
	for ( let i = 0; i < 16; i++ ) {
		const x = i * 32 + 8;
		ctx.drawImage( wood, ( i * 37 ) % 240, 0, 15, 256, x, 0, 15, 128 );
		ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'; // Rounded-edge shading.
		ctx.fillRect( x, 0, 2, 128 );
		ctx.fillRect( x + 13, 0, 2, 128 );
	}
	return c;
}

/**
 * Back panel of one shelving bay (0 → 2.05 m tall): wood, with the warm glow that the LED strip
 * under each shelf throws on the wood below it. glow=true draws only the light (emissive map).
 */
export function shelfBackCanvas( S, levels, height, glow ) {
	const c = makeCanvas( 256, 512 );
	const ctx = c.getContext( '2d' );
	if ( glow ) {
		ctx.fillStyle = '#000000';
		ctx.fillRect( 0, 0, 256, 512 );
	} else {
		ctx.drawImage( woodCanvas( S ), 0, 0, 256, 512 );
	}
	const light = glow ? S.glow.emissive : S.glow.wood;
	levels.concat( [ height ] ).forEach( ( y ) => {
		const top = ( 1 - y / height ) * 512;
		const g = ctx.createLinearGradient( 0, top, 0, top + 120 );
		g.addColorStop( 0, rgba( light, glow ? 0.9 : 0.55 ) );
		g.addColorStop( 1, rgba( light, 0 ) );
		ctx.fillStyle = g;
		ctx.fillRect( 0, top, 256, 120 );
	} );
	if ( ! glow ) {
		ctx.fillStyle = rgba( S.wood.seam, 0.35 ); // Seams between bays.
		ctx.fillRect( 0, 0, 3, 512 );
		ctx.fillRect( 253, 0, 3, 512 );
	}
	return c;
}

function leaf( ctx, x, y, len, wid, angle, fill, rib ) {
	ctx.save();
	ctx.translate( x, y );
	ctx.rotate( angle );
	ctx.fillStyle = fill;
	ctx.beginPath();
	ctx.moveTo( 0, 0 );
	ctx.quadraticCurveTo( wid, -len * 0.45, 0, -len );
	ctx.quadraticCurveTo( -wid, -len * 0.45, 0, 0 );
	ctx.fill();
	if ( rib ) {
		ctx.strokeStyle = rib;
		ctx.lineWidth = Math.max( 1, wid * 0.08 );
		ctx.beginPath();
		ctx.moveTo( 0, 0 );
		ctx.lineTo( 0, -len * 0.92 );
		ctx.stroke();
	}
	ctx.restore();
}

/** A leafy plant on transparency (for crossed-plane plants); olive=true draws slim silvery leaves. */
export function plantCanvas( S, olive ) {
	const c = makeCanvas( 256, 256 );
	const ctx = c.getContext( '2d' );
	const r = rng( olive ? 31 : 17 );
	const n = olive ? 260 : 46;
	const greens = S.plants.greens;
	for ( let i = 0; i < n; i++ ) {
		if ( olive ) {
			// Olive canopy: a loose round cloud of small grey-green leaves.
			const a = r() * Math.PI * 2;
			const d = Math.sqrt( r() ) * 110;
			leaf( ctx, 128 + Math.cos( a ) * d, 128 + Math.sin( a ) * d * 0.9, 16 + r() * 12, 3 + r() * 2, r() * Math.PI * 2, S.plants.olive[ r() > 0.5 ? 0 : 1 ], null );
		} else {
			// Leafy pot plant: leaves radiating up and out from the base.
			const a = ( r() - 0.5 ) * 2.4;
			leaf( ctx, 128 + ( r() - 0.5 ) * 30, 250, 90 + r() * 120, 14 + r() * 14, a, greens[ Math.floor( r() * greens.length ) ], rgba( S.plants.rib, 0.35 ) );
		}
	}
	return c;
}

/** Living wall: dense layered foliage, lit warmly from the cove above. */
export function livingWallCanvas( S ) {
	const c = makeCanvas( 1024, 512 );
	const ctx = c.getContext( '2d' );
	const r = rng( 101 );
	const greens = S.plants.greens;
	ctx.fillStyle = S.plants.wallBase;
	ctx.fillRect( 0, 0, 1024, 512 );
	for ( let i = 0; i < 2600; i++ ) {
		const x = r() * 1024;
		const y = r() * 560;
		const big = r() > 0.85;
		const len = big ? 40 + r() * 50 : 14 + r() * 26;
		const fern = r() > 0.7;
		const fill = greens[ Math.floor( r() * greens.length ) ];
		if ( fern ) {
			const a = r() * Math.PI * 2;
			for ( let k = 0; k < 6; k++ ) {
				leaf( ctx, x + Math.sin( a ) * k * 6, y - Math.cos( a ) * k * 6, len * 0.4, len * 0.12, a + ( k % 2 ? 1 : -1 ) * 1.1, fill, null );
			}
		} else {
			leaf( ctx, x, y, len, len * ( big ? 0.4 : 0.3 ), r() * Math.PI * 2, fill, rgba( S.plants.rib, 0.25 ) );
		}
	}
	const light = ctx.createLinearGradient( 0, 0, 0, 512 );
	light.addColorStop( 0, rgba( S.plants.cove, 0.3 ) );
	light.addColorStop( 0.35, rgba( S.plants.cove, 0.06 ) );
	light.addColorStop( 1, 'rgba(0, 0, 0, 0.25)' );
	ctx.fillStyle = light;
	ctx.fillRect( 0, 0, 1024, 512 );
	return c;
}

/** Soft dark rectangle with blurred edges: a cheap contact shadow under furniture. */
export function shadowCanvas( S ) {
	const c = makeCanvas( 128, 128 );
	const ctx = c.getContext( '2d' );
	const g = ctx.createRadialGradient( 64, 64, 10, 64, 64, 64 );
	g.addColorStop( 0, rgba( S.palette.shadow, 0.42 ) );
	g.addColorStop( 0.6, rgba( S.palette.shadow, 0.22 ) );
	g.addColorStop( 1, rgba( S.palette.shadow, 0 ) );
	ctx.fillStyle = g;
	ctx.fillRect( 0, 0, 128, 128 );
	return c;
}

/** The view out through the entrance doors: sky, a row of trees, the pavement. */
export function outsideCanvas( S ) {
	const c = makeCanvas( 512, 320 );
	const ctx = c.getContext( '2d' );
	const r = rng( 55 );
	const O = S.outside;
	const sky = ctx.createLinearGradient( 0, 0, 0, 200 );
	sky.addColorStop( 0, O.skyTop );
	sky.addColorStop( 1, O.skyBottom );
	ctx.fillStyle = sky;
	ctx.fillRect( 0, 0, 512, 320 );
	for ( let i = 0; i < 70; i++ ) {
		ctx.fillStyle = O.trees[ i % O.trees.length ];
		ctx.beginPath();
		ctx.arc( r() * 512, 150 + r() * 40, 18 + r() * 26, 0, Math.PI * 2 );
		ctx.fill();
	}
	ctx.fillStyle = O.ground;
	ctx.fillRect( 0, 200, 512, 120 );
	ctx.fillStyle = O.curb;
	ctx.fillRect( 0, 200, 512, 6 );
	return c;
}

/** Sign-coloured panel with a label in the skin's sign font (fascias, store name, checkout). */
export function plaqueCanvas( S, text, w, h, accent, logo ) {
	const c = makeCanvas( w || 1024, h || 160 );
	const ctx = c.getContext( '2d' );
	ctx.fillStyle = S.palette.sign;
	ctx.fillRect( 0, 0, c.width, c.height );
	if ( accent ) {
		ctx.fillStyle = accent;
		ctx.fillRect( 0, c.height - Math.round( c.height * 0.06 ), c.width, Math.round( c.height * 0.06 ) );
	}
	ctx.fillStyle = S.palette.signInk;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '400 ' + Math.round( c.height * 0.5 ) + 'px ' + signFont( S );
	if ( ! logo ) {
		ctx.fillText( ellipsize( ctx, text, c.width - 80 ), c.width / 2, c.height / 2 + 2 );
		return c;
	}
	// The logo, then the name beside it; the pair is centred.
	const box = fitBox( logo, c.width * 0.45, c.height * 0.66 );
	const gap = text ? c.height * 0.2 : 0;
	const words = text ? ellipsize( ctx, text, c.width - 80 - box.w - gap ) : '';
	const total = box.w + gap + ( words ? ctx.measureText( words ).width : 0 );
	const left = ( c.width - total ) / 2;
	ctx.drawImage( logo, left, ( c.height - box.h ) / 2, box.w, box.h );
	if ( words ) {
		ctx.textAlign = 'left';
		ctx.fillText( words, left + box.w + gap, c.height / 2 + 2 );
	}
	return c;
}

/** The size of a picture scaled to fit inside w × h, keeping its shape. */
export function fitBox( img, w, h ) {
	const iw = img.naturalWidth || img.width || 1;
	const ih = img.naturalHeight || img.height || 1;
	const s = Math.min( w / iw, h / ih );
	return { w: iw * s, h: ih * s };
}

function ellipsize( ctx, text, max ) {
	text = String( text || '' );
	if ( ctx.measureText( text ).width <= max ) {
		return text;
	}
	while ( text.length > 1 && ctx.measureText( text + '…' ).width > max ) {
		text = text.slice( 0, -1 );
	}
	return text + '…';
}

/** Two lines, word-wrapped, the second ellipsized. */
function twoLines( ctx, text, max ) {
	const words = String( text || '' ).split( /\s+/ );
	let first = '';
	let i = 0;
	for ( ; i < words.length; i++ ) {
		const next = first ? first + ' ' + words[ i ] : words[ i ];
		if ( ctx.measureText( next ).width > max && first ) {
			break;
		}
		first = next;
	}
	const rest = words.slice( i ).join( ' ' );
	return rest ? [ ellipsize( ctx, first, max ), ellipsize( ctx, rest, max ) ] : [ ellipsize( ctx, first, max ) ];
}

function roundRect( ctx, x, y, w, h, r ) {
	ctx.beginPath();
	ctx.moveTo( x + r, y );
	ctx.arcTo( x + w, y, x + w, y + h, r );
	ctx.arcTo( x + w, y + h, x, y + h, r );
	ctx.arcTo( x, y + h, x, y, r );
	ctx.arcTo( x, y, x + w, y, r );
	ctx.closePath();
}

/**
 * Hanging aisle sign: deep green with a fine inset rule, the section name in serif and a small
 * aisle number; a thin strip of the section colour keeps it matching the minimap.
 */
export function signCanvas( S, number, label, accent ) {
	const c = makeCanvas( 1024, 256 );
	const ctx = c.getContext( '2d' );
	ctx.fillStyle = S.palette.sign;
	ctx.fillRect( 0, 0, 1024, 256 );
	ctx.strokeStyle = rgba( S.palette.signInk, 0.35 );
	ctx.lineWidth = 3;
	ctx.strokeRect( 18, 18, 988, 220 );
	ctx.fillStyle = accent;
	ctx.fillRect( 18, 222, 988, 16 );
	ctx.fillStyle = S.palette.signInk;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	ctx.font = '600 40px ' + FONT;
	ctx.globalAlpha = 0.7;
	ctx.fillText( String( number ).padStart( 2, '0' ), 52, 122 );
	ctx.globalAlpha = 1;
	ctx.textAlign = 'center';
	ctx.font = '400 112px ' + signFont( S );
	ctx.fillText( ellipsize( ctx, label, 780 ), 532, 124 );
	return c;
}

/** Shelf-edge price tag. */
export function tagCanvas( name, price, was, accent ) {
	const c = makeCanvas( 512, 128 );
	const ctx = c.getContext( '2d' );
	ctx.fillStyle = '#fffdf3';
	ctx.fillRect( 0, 0, 512, 128 );
	ctx.fillStyle = accent;
	ctx.fillRect( 0, 0, 512, 12 );
	ctx.fillStyle = '#1b2440';
	ctx.textBaseline = 'alphabetic';
	ctx.font = '600 34px ' + FONT;
	ctx.fillText( ellipsize( ctx, name, 480 ), 16, 54 );
	ctx.font = '800 44px ' + FONT;
	ctx.fillText( price || '', 16, 108 );
	if ( was ) {
		const w = ctx.measureText( price || '' ).width;
		ctx.font = '500 30px ' + FONT;
		ctx.fillStyle = '#676a78';
		const x = 32 + w;
		ctx.fillText( was, x, 106 );
		ctx.fillRect( x, 95, ctx.measureText( was ).width, 3 );
	}
	return c;
}

/**
 * Product packaging front: the real product image ("contain"), a name strip in the section
 * colour and stickers (try-on, sale, out of stock). Redrawn when the image arrives or a
 * flag changes.
 */
export function drawPackaging( canvas, image, info ) {
	const ctx = canvas.getContext( '2d' );
	const w = canvas.width;
	const h = canvas.height;
	const strip = Math.round( h * 0.2 );
	ctx.fillStyle = '#ffffff';
	ctx.fillRect( 0, 0, w, h );
	ctx.fillStyle = '#f3f0ea';
	ctx.fillRect( 0, 0, w, h - strip );
	if ( image && image.naturalWidth ) {
		const box = { x: 12, y: 12, w: w - 24, h: h - strip - 24 };
		const s = Math.min( box.w / image.naturalWidth, box.h / image.naturalHeight );
		const iw = image.naturalWidth * s;
		const ih = image.naturalHeight * s;
		ctx.drawImage( image, box.x + ( box.w - iw ) / 2, box.y + ( box.h - ih ) / 2, iw, ih );
	} else {
		ctx.fillStyle = '#c9c1b4';
		ctx.font = '600 26px ' + FONT;
		ctx.textAlign = 'center';
		const lines = twoLines( ctx, info.name, w - 40 );
		lines.forEach( ( l, i ) => ctx.fillText( l, w / 2, ( h - strip ) / 2 + i * 30 ) );
		ctx.textAlign = 'left';
	}
	ctx.fillStyle = info.accent;
	ctx.fillRect( 0, h - strip, w, strip );
	ctx.fillStyle = inkOn( info.accent );
	ctx.font = '700 25px ' + FONT;
	ctx.textAlign = 'center';
	const lines = twoLines( ctx, info.name, w - 24 );
	const top = h - strip + ( lines.length > 1 ? strip * 0.38 : strip * 0.6 );
	lines.forEach( ( l, i ) => ctx.fillText( l, w / 2, top + i * 27 ) );
	ctx.textAlign = 'left';

	if ( info.tryon ) {
		ctx.fillStyle = '#d4a24c';
		roundRect( ctx, 10, 10, 112, 38, 19 );
		ctx.fill();
		ctx.fillStyle = '#1b2440';
		ctx.font = '800 22px ' + FONT;
		ctx.fillText( info.labels.tryOn, 24, 37 );
	}
	if ( info.sale ) {
		ctx.fillStyle = '#b4301c';
		roundRect( ctx, w - 92, 10, 82, 38, 19 );
		ctx.fill();
		ctx.fillStyle = '#ffffff';
		ctx.font = '800 22px ' + FONT;
		ctx.fillText( info.labels.sale, w - 78, 37 );
	}
	if ( info.out ) {
		ctx.fillStyle = 'rgba(74,78,94,.62)';
		ctx.fillRect( 0, 0, w, h - strip );
		ctx.fillStyle = '#ffffff';
		ctx.font = '800 28px ' + FONT;
		ctx.textAlign = 'center';
		ctx.fillText( info.labels.out, w / 2, ( h - strip ) / 2 );
		ctx.textAlign = 'left';
	}
}

/** Large stone tiles: four tones, fine speckle, faint cloudiness and hairline joints. */
export function floorCanvas( S ) {
	const c = makeCanvas( 1024, 1024 );
	const ctx = c.getContext( '2d' );
	const r = rng( 3 );
	const F = S.floor;
	for ( let y = 0; y < 2; y++ ) {
		for ( let x = 0; x < 2; x++ ) {
			ctx.fillStyle = F.tones[ ( y * 2 + x ) % F.tones.length ];
			ctx.fillRect( x * 512, y * 512, 512, 512 );
		}
	}
	for ( let i = 0; i < 40; i++ ) {
		const g = ctx.createRadialGradient( r() * 1024, r() * 1024, 0, r() * 1024, r() * 1024, 80 + r() * 160 );
		const light = r() > 0.5;
		g.addColorStop( 0, light ? rgba( F.clouds[ 0 ], 0.18 ) : rgba( F.clouds[ 1 ], 0.1 ) );
		g.addColorStop( 1, 'rgba(0, 0, 0, 0)' );
		ctx.fillStyle = g;
		ctx.fillRect( 0, 0, 1024, 1024 );
	}
	const alphas = [ 0.55, 0.6, 0.8, 0.4 ];
	const specks = F.speckle.map( ( hex, i ) => rgba( hex, alphas[ i % alphas.length ] ) );
	for ( let i = 0; i < 9000; i++ ) {
		ctx.fillStyle = specks[ Math.floor( r() * specks.length ) ];
		const s = r() < 0.92 ? 1 + r() * 1.6 : 2.5 + r() * 3;
		ctx.fillRect( r() * 1024, r() * 1024, s, s * ( 0.6 + r() * 0.8 ) );
	}
	ctx.strokeStyle = rgba( F.grout, 0.7 );
	ctx.lineWidth = 2;
	for ( let i = 0; i <= 1024; i += 512 ) {
		ctx.beginPath();
		ctx.moveTo( i, 0 );
		ctx.lineTo( i, 1024 );
		ctx.moveTo( 0, i );
		ctx.lineTo( 1024, i );
		ctx.stroke();
	}
	return c;
}

const images = new Map();

/** Load an image once (same-origin product images). */
export function loadImage( url ) {
	if ( ! url ) {
		return Promise.resolve( null );
	}
	if ( ! images.has( url ) ) {
		images.set( url, new Promise( ( resolve ) => {
			const img = new Image();
			// Product photos may come from another origin (an image CDN, offloaded media, a hosted platform's
			// media server); without CORS mode the browser taints them and WebGL refuses them as textures.
			img.crossOrigin = 'anonymous';
			img.decoding = 'async';
			img.onload = () => resolve( img );
			img.onerror = () => resolve( null );
			img.src = url;
		} ) );
	}
	return images.get( url );
}
