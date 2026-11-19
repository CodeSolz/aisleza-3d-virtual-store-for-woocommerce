/**
 * Aisleza — the walk-in 3D store (window.AislezaWorld).
 *
 * Bundled with three.js into assets/js/world.js (npm run build) and loaded only after the
 * shopper enters. store.js stays in charge of products, the cart, dialogs and try-on; this
 * module draws the building, stocks the shelves it is given and reports what the shopper
 * points at and where they are.
 *
 * Nothing renders while the shopper is idle: frames are drawn only while moving, looking,
 * auto-walking or when a texture arrives, and never while the tab is hidden.
 */
import {
	AmbientLight,
	Color,
	DirectionalLight,
	Fog,
	HemisphereLight,
	Matrix4,
	NeutralToneMapping,
	Object3D,
	PerspectiveCamera,
	PMREMGenerator,
	Quaternion,
	Raycaster,
	Scene,
	SRGBColorSpace,
	Vector2,
	Vector3,
	WebGLRenderer,
	Box3,
	Ray
} from 'three';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { StoreRoom } from './room.js';
import { buildStore, HELPERS, layout, SHELF } from './scene.js';
import { registerFixture } from './fixtures.js';
import { registerProductModels } from './models.js';
import { registerStyle } from './styles.js';
import { resolveSkin } from './skin.js';
import { Shelves } from './shelves.js';
import { plaqueCanvas, toTexture } from './textures.js';
import { brandTrolley, buildTrolley, fillTrolley } from './trolley.js';

const EYE = 1.6;
const WALK = 2.4;
const RUN = 4.4;
const AUTO = 4.6;
const TURN = 2.1;
const LOOK = 0.0042;
const BODY_R = 0.3;
const PIXELS = 3.2e6; // Most device pixels drawn per frame (desktop): about 2400 × 1350.
const PIXELS_PHONE = 1.6e6;
// The trolley's footprint, pivoting at the handle in the shopper's hands: how far ahead the basket
// centre rides (REACH, pulled in to REACH_MIN beside shelving), how far it may angle away from
// straight ahead (SWIVEL), and its rectangle (half width, length from the handle to the nose).
const REACH = 1.15;
const REACH_MIN = 0.85;
const SWIVEL = 0.55;
const HANDLE = 0.51; // Handle bar behind the trolley's centre.
const FOOT = { hw: 0.36, back: 0.55, front: 0.47 }; // Half width; handle side and nose side of the centre.
const POSES = ( () => {
	const out = [];
	[ 0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36, 0.46, -0.46, SWIVEL, -SWIVEL ].forEach( ( swivel ) => {
		[ REACH, 1.0, REACH_MIN ].forEach( ( reach ) => out.push( { swivel, reach } ) );
	} );
	return out;
} )();

function supported() {
	try {
		const c = document.createElement( 'canvas' );
		return !! ( window.WebGLRenderingContext && ( c.getContext( 'webgl2' ) || c.getContext( 'webgl' ) ) );
	} catch ( e ) {
		return false;
	}
}

function el( tag, cls, attrs ) {
	const n = document.createElement( tag );
	if ( cls ) {
		n.className = cls;
	}
	Object.keys( attrs || {} ).forEach( ( k ) => n.setAttribute( k, attrs[ k ] ) );
	return n;
}

/**
 * Whether a rectangle overlaps an axis-aligned box (separating axes). The rectangle: centre (cx, cz),
 * unit axis (ux, uz) along its length, half length hl and half width hw.
 */
function rectHitsBox( cx, cz, ux, uz, hl, hw, o ) {
	const ex = ( o.maxX - o.minX ) / 2;
	const ez = ( o.maxZ - o.minZ ) / 2;
	const dx = cx - ( o.minX + o.maxX ) / 2;
	const dz = cz - ( o.minZ + o.maxZ ) / 2;
	const vx = -uz;
	const vz = ux;
	return Math.abs( dx ) <= ex + Math.abs( ux ) * hl + Math.abs( vx ) * hw &&
		Math.abs( dz ) <= ez + Math.abs( uz ) * hl + Math.abs( vz ) * hw &&
		Math.abs( dx * ux + dz * uz ) <= hl + ex * Math.abs( ux ) + ez * Math.abs( uz ) &&
		Math.abs( dx * vx + dz * vz ) <= hw + ex * Math.abs( vx ) + ez * Math.abs( vz );
}

/** Whether a rectangle (as in rectHitsBox) overlaps a circle at (sx, sz) of radius r. */
function rectHitsCircle( cx, cz, ux, uz, hl, hw, sx, sz, r ) {
	const dx = sx - cx;
	const dz = sz - cz;
	const along = Math.max( -hl, Math.min( hl, dx * ux + dz * uz ) );
	const across = Math.max( -hw, Math.min( hw, dx * -uz + dz * ux ) );
	const px = cx + ux * along - uz * across;
	const pz = cz + uz * along + ux * across;
	return ( sx - px ) * ( sx - px ) + ( sz - pz ) * ( sz - pz ) < r * r;
}

function angleTo( from, to ) {
	let d = to - from;
	while ( d > Math.PI ) {
		d -= Math.PI * 2;
	}
	while ( d < -Math.PI ) {
		d += Math.PI * 2;
	}
	return d;
}

class World {
	constructor( container, opts ) {
		this.box = container;
		this.o = opts;
		this.t = opts.i18n;
		this.skin = resolveSkin( opts.skin );
		this.sections = opts.sections;
		this.L = layout( this.sections.length, opts.maxCount );
		this.keys = new Set();
		this.auto = null;
		this.drag = null;
		this.stick = null;
		this.dirty = true;
		this.raf = 0;
		this.place = undefined;
		this.products = new Map();
		this.loaded = {};
		this.bumpT = 0;
		this.lastAisleCheck = 0;

		this.buildDom();
		this.buildScene();
		this.bind();
		this.resize();
		const start = this.L.start;
		this.body.position.set( start.x, 0, -start.d );
		this.body.rotation.y = start.yaw;
		// Where the shopper left the trolley before a refresh, else the entrance (or a given aisle).
		if ( ! this.restorePose( opts.startPose ) && typeof opts.startAisle === 'number' && opts.startAisle >= 0 && opts.startAisle < this.sections.length ) {
			this.teleportToAisle( opts.startAisle );
		}
		this.updatePlace( true );
		this.manageAisles( true );
		this.request();
	}

	/* ---------------------------------------------------------------- DOM */

	buildDom() {
		const t = this.t;
		this.root = el( 'div', 'aisleza-world' );
		this.canvas = el( 'canvas', 'aisleza-world__canvas', {
			tabindex: '0',
			role: 'application',
			'aria-roledescription': t.worldRole,
			'aria-label': t.worldLabel,
			'aria-describedby': 'aisleza-world-help'
		} );
		this.where = el( 'div', 'aisleza-world__where', { 'aria-hidden': 'true' } );
		this.reticle = el( 'div', 'aisleza-world__reticle', { 'aria-hidden': 'true' } );
		this.tip = el( 'div', 'aisleza-world__tip', { 'aria-hidden': 'true' } );
		this.tip.hidden = true;
		this.help = el( 'div', 'aisleza-world__help', { id: 'aisleza-world-help' } );
		const coarse = window.matchMedia && window.matchMedia( '(pointer: coarse)' ).matches;
		this.coarse = coarse;
		( coarse ? t.helpTouch : t.helpKeys ).forEach( ( line ) => {
			const p = el( 'p' );
			p.textContent = line;
			this.help.appendChild( p );
		} );
		const ok = el( 'button', 'aisleza-world__help-close', { type: 'button' } );
		ok.textContent = t.gotIt;
		ok.addEventListener( 'click', () => {
			this.help.classList.add( 'is-dismissed' );
			this.canvas.focus( { preventScroll: true } );
		} );
		this.help.appendChild( ok );
		this.map = el( 'canvas', 'aisleza-world__map', { 'aria-hidden': 'true', title: t.minimap } );
		// Add-on HTML in the store (addHtml) is laid over the canvas here (CSS 3D, in step with the camera).
		this.css = new CSS3DRenderer();
		this.css.domElement.className = 'aisleza-world__css';
		this.cssScene = new Scene();
		// While add-on HTML (a video player) shows over the store, the shopper's trolley moves to its own
		// transparent canvas above that layer wherever they overlap, so it stays in front at its true
		// shape. Otherwise it is drawn with the store (one canvas, full speed).
		this.trolleyCanvas = el( 'canvas', 'aisleza-world__trolley', { 'aria-hidden': 'true' } );
		this.root.append( this.canvas, this.css.domElement, this.trolleyCanvas, this.where, this.reticle, this.tip, this.help, this.map );
		if ( coarse ) {
			this.stickEl = el( 'div', 'aisleza-world__stick', { 'aria-hidden': 'true' } );
			this.knob = el( 'span', 'aisleza-world__knob' );
			this.stickEl.appendChild( this.knob );
			this.root.appendChild( this.stickEl );
		}
		this.box.appendChild( this.root );
	}

	/* -------------------------------------------------------------- Scene */

	buildScene() {
		const mobile = this.coarse || Math.min( window.innerWidth, window.innerHeight ) < 640;
		this.renderer = new WebGLRenderer( { canvas: this.canvas, antialias: ! mobile, powerPreference: 'default' } );
		// Sharpness within a pixel budget: a full-screen store on a large or high-density screen
		// draws at most PIXELS device pixels a frame (and lowers that further, in steps, when frames
		// come too slowly on a weak graphics chip; see adaptQuality).
		this.maxRatio = Math.min( window.devicePixelRatio || 1, mobile ? 1.25 : 1.6 );
		this.pixelBudget = mobile ? PIXELS_PHONE : PIXELS;
		this.quality = 1;
		this.renderer.setPixelRatio( this.maxRatio );
		this.renderer.outputColorSpace = SRGBColorSpace;
		// Neutral tone mapping keeps product photos true to colour while the warm lights glow.
		this.renderer.toneMapping = NeutralToneMapping;
		const light = this.skin.lighting;
		this.renderer.toneMappingExposure = light.exposure;

		this.scene = new Scene();
		this.scene.background = new Color( light.background );
		this.scene.fog = new Fog( light.background, light.fogNear, light.fogFar );
		// A soft studio environment gives the stone, wood and glass their sheen (no shadow maps).
		const pmrem = new PMREMGenerator( this.renderer );
		this.envMap = pmrem.fromScene( new StoreRoom(), 0.04 ).texture;
		pmrem.dispose();
		this.scene.environment = this.envMap;
		this.scene.environmentIntensity = light.environment;
		this.scene.add( new HemisphereLight( light.sky, light.ground, light.hemisphere ) );
		this.scene.add( new AmbientLight( light.ambient, light.ambientIntensity ) );
		const sun = new DirectionalLight( light.sun, light.sunIntensity );
		sun.position.set( -6, 10, 4 );
		this.scene.add( sun );

		// The trolley's renderer and scene: the same lights and tone, transparent around the trolley.
		this.trolleyRenderer = new WebGLRenderer( { canvas: this.trolleyCanvas, alpha: true, antialias: ! mobile, powerPreference: 'default' } );
		this.trolleyRenderer.setPixelRatio( this.renderer.getPixelRatio() );
		this.trolleyRenderer.outputColorSpace = SRGBColorSpace;
		this.trolleyRenderer.toneMapping = NeutralToneMapping;
		this.trolleyRenderer.toneMappingExposure = light.exposure;
		this.trolleyRenderer.setClearColor( 0x000000, 0 );
		this.trolleyScene = new Scene();
		// Its own reflections (a canvas cannot borrow another canvas's textures).
		const trolleyPmrem = new PMREMGenerator( this.trolleyRenderer );
		this.trolleyEnv = trolleyPmrem.fromScene( new StoreRoom(), 0.04 ).texture;
		trolleyPmrem.dispose();
		this.trolleyScene.environment = this.trolleyEnv;
		this.trolleyScene.environmentIntensity = light.environment;
		this.trolleyScene.add( new HemisphereLight( light.sky, light.ground, light.hemisphere ) );
		this.trolleyScene.add( new AmbientLight( light.ambient, light.ambientIntensity ) );
		const trolleySun = new DirectionalLight( light.sun, light.sunIntensity );
		trolleySun.position.set( -6, 10, 4 );
		this.trolleyScene.add( trolleySun );
		this.trolleyRig = new Object3D(); // Follows the shopper's body each frame.
		this.trolleyScene.add( this.trolleyRig );

		const built = buildStore( this.L, {
			mobile, // No antialiasing here, so thin repeated geometry is drawn as pictures instead.
			accent: this.o.accent,
			skin: this.skin,
			storeName: this.o.storeName,
			sections: this.sections,
			config: this.o.config && typeof this.o.config === 'object' ? this.o.config : {}, // For add-on fixtures.
			store: this, // Fixtures' click handlers act on this store.
			changed: () => this.request(),
			labels: { checkout: this.t.checkoutLamp }
		} );
		this.scene.add( built.group );
		this.obstacles = built.obstacles;
		this.floor = built.floor;
		this.counters = built.counters;
		this.clickables = built.clickables; // Add-on fixtures' clickable parts.
		this.htmlLayers = []; // Add-on HTML over the store (addHtml).
		this.lobbyEntries = []; // Add-on entries in the keyboard list between the aisles (addListEntry).
		this.destroyers = []; // Add-on clean-ups (onDestroy).

		this.body = new Object3D();
		this.scene.add( this.body );
		this.camera = new PerspectiveCamera( 62, 1, 0.05, 90 );
		this.camera.position.set( 0, EYE, 0.05 );
		this.camera.rotation.order = 'YXZ';
		this.camera.rotation.x = -0.26; // Slightly down: the trolley and its contents stay in view.
		this.body.add( this.camera );
		// No canvas-bound reflection map: the trolley takes the reflections of whichever scene draws it.
		this.trolley = buildTrolley( this.o.accent, null, this.o.storeName );
		this.trolley.position.set( 0, 0, -REACH ); // At arm's length: the handle shows at the bottom of the view.
		this.body.add( this.trolley );
		this.trolleyOnTop = false;
		this.rig = { eye: EYE, back: 0, pitch: -0.26, trolley: true };
		this.pose = { swivel: 0, reach: REACH }; // Where the trolley is drawn (eases towards the target).
		this.tickers = []; // Add-on functions run every frame (addTicker).
		this.extras = []; // Add-on objects in the store (addObject), with their click handlers.
		this.poseTarget = { swivel: 0, reach: REACH };
		this.showLogo( built.doorSign );

		this.shelves = new Shelves( this.L, {
			skin: this.skin,
			describe: this.o.describe,
			changed: () => this.request()
		} );
		this.stockDisplays( built.displays );
		this.warmShaders();
		this.ray = new Raycaster();
		this.ray.far = 40;
		this.pointer = new Vector2();
	}

	/** Stock the add-on fixtures' product displays (all at once: a few products each). */
	stockDisplays( displays ) {
		const ids = [];
		displays.forEach( ( d ) => d.products.forEach( ( id ) => ids.includes( id ) || ids.push( id ) ) );
		if ( ! ids.length || ! this.o.loadProducts ) {
			return;
		}
		this.o.loadProducts( ids ).then( ( products ) => {
			if ( this.destroyed ) {
				return;
			}
			const byId = new Map( products.map( ( p ) => [ p.id, p ] ) );
			byId.forEach( ( p, id ) => this.products.set( id, p ) );
			displays.forEach( ( d ) => {
				const list = d.products.map( ( id ) => byId.get( id ) ).filter( Boolean );
				if ( list.length ) {
					this.scene.add( this.shelves.display( d.key, d.slots, list, this.o.accent ).group );
				}
			} );
			this.request();
		}, () => {} ); // The displays stay empty; the rest of the store is unaffected.
	}

	/* ------------------------------------------------------------- Events */

	bind() {
		const c = this.canvas;
		this.onKeyDown = ( e ) => this.keyDown( e );
		this.onKeyUp = ( e ) => this.keys.delete( e.code );
		c.addEventListener( 'keydown', this.onKeyDown );
		c.addEventListener( 'keyup', this.onKeyUp );
		c.addEventListener( 'blur', () => {
			this.keys.clear();
		} );
		// Keys also work while nothing else has focus (full-window store), never over a dialog.
		this.onDocKey = ( e ) => {
			if ( 'keyup' === e.type ) {
				this.keys.delete( e.code ); // Wherever the focus went meanwhile: a key never sticks.
			} else if ( document.activeElement === document.body && ! this.o.blocked() ) {
				this.keyDown( e );
			}
		};
		document.addEventListener( 'keydown', this.onDocKey );
		document.addEventListener( 'keyup', this.onDocKey );
		this.onWindowBlur = () => this.keys.clear();
		window.addEventListener( 'blur', this.onWindowBlur );

		c.addEventListener( 'pointerdown', ( e ) => {
			if ( this.o.blocked() ) {
				return;
			}
			c.setPointerCapture( e.pointerId );
			this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0, id: e.pointerId };
			this.tip.hidden = true;
		} );
		c.addEventListener( 'pointermove', ( e ) => {
			if ( this.drag && this.drag.id === e.pointerId ) {
				const dx = e.clientX - this.drag.x;
				const dy = e.clientY - this.drag.y;
				this.drag.x = e.clientX;
				this.drag.y = e.clientY;
				this.drag.moved += Math.abs( dx ) + Math.abs( dy );
				if ( this.drag.moved > 4 ) {
					this.auto = null;
					// Looking round turns the shopper and the trolley with them: the same check as the keys.
					if ( dx && this.turnBy( dx * LOOK ) ) {
						this.afterMove( false );
					}
					this.camera.rotation.x = Math.max( -0.75, Math.min( 0.5, this.camera.rotation.x - dy * LOOK ) );
					this.request();
				}
				return;
			}
			if ( 'mouse' === e.pointerType ) {
				this.hoverAt = [ e.clientX, e.clientY ];
				this.mouseAt = this.hoverAt;
				this.request();
			}
		} );
		const end = ( e ) => {
			if ( ! this.drag || this.drag.id !== e.pointerId ) {
				return;
			}
			const click = this.drag.moved < 8 && performance.now() - this.drag.t < 600;
			this.drag = null;
			if ( click && 'pointerup' === e.type ) {
				this.clickAt( e.clientX, e.clientY );
			}
		};
		c.addEventListener( 'pointerup', end );
		c.addEventListener( 'pointercancel', end );
		c.addEventListener( 'pointerleave', () => {
			this.hoverAt = null;
			this.mouseAt = null;
			this.tip.hidden = true;
			this.hoverAddonAt( null );
		} );

		this.map.addEventListener( 'click', ( e ) => {
			const r = this.map.getBoundingClientRect();
			const s = this.mapScale;
			const x = this.L.xMin + ( e.clientX - r.left ) / s;
			const d = ( e.clientY - r.top ) / s;
			const i = this.aisleAt( x, d );
			if ( i >= 0 ) {
				this.walkToAisle( i );
			} else {
				this.walkTo( x, -d, null );
			}
		} );

		if ( this.stickEl ) {
			const move = ( e ) => {
				const r = this.stickEl.getBoundingClientRect();
				const rx = ( e.clientX - ( r.left + r.width / 2 ) ) / ( r.width / 2 );
				const ry = ( e.clientY - ( r.top + r.height / 2 ) ) / ( r.height / 2 );
				const len = Math.min( 1, Math.hypot( rx, ry ) );
				const a = Math.atan2( ry, rx );
				this.stick = { x: Math.cos( a ) * len, y: Math.sin( a ) * len };
				this.knob.style.transform = 'translate(' + ( this.stick.x * 34 ) + 'px,' + ( this.stick.y * 34 ) + 'px)';
				this.auto = null;
				this.request();
			};
			this.stickEl.addEventListener( 'pointerdown', ( e ) => {
				this.stickEl.setPointerCapture( e.pointerId );
				move( e );
			} );
			this.stickEl.addEventListener( 'pointermove', ( e ) => {
				if ( this.stick ) {
					move( e );
				}
			} );
			const stop = () => {
				this.stick = null;
				this.knob.style.transform = '';
			};
			this.stickEl.addEventListener( 'pointerup', stop );
			this.stickEl.addEventListener( 'pointercancel', stop );
		}

		this.onVisibility = () => {
			if ( document.hidden ) {
				this.savePose( true ); // Leaving the tab (or the page is about to refresh).
				this.keys.clear();
				this.stick = null;
			} else {
				this.request();
			}
		};
		document.addEventListener( 'visibilitychange', this.onVisibility );
		this.onPageHide = () => this.savePose( true ); // A refresh or leaving the page.
		window.addEventListener( 'pagehide', this.onPageHide );
		this.resizer = new ResizeObserver( () => this.resize() );
		this.resizer.observe( this.box );
	}

	keyDown( e ) {
		const code = e.code;
		const movement = [ 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight' ];
		if ( movement.indexOf( code ) !== -1 ) {
			e.preventDefault();
			this.keys.add( code );
			this.auto = null;
			this.help.classList.add( 'is-dismissed' );
			this.request();
		} else if ( 'Enter' === code || 'Space' === code || 'NumpadEnter' === code ) {
			e.preventDefault();
			this.interactAhead();
		}
	}

	/* ------------------------------------------------------------ Picking */

	pick( clientX, clientY ) {
		const r = this.canvas.getBoundingClientRect();
		this.pointer.set( ( ( clientX - r.left ) / r.width ) * 2 - 1, -( ( clientY - r.top ) / r.height ) * 2 + 1 );
		this.ray.setFromCamera( this.pointer, this.camera );
		const targets = [ this.floor ];
		targets.push.apply( targets, this.shelves.pickables() );
		targets.push.apply( targets, this.clickables );
		this.counters.forEach( ( c ) => targets.push.apply( targets, c.children ) );
		this.extras.forEach( ( x ) => {
			if ( x.object.visible ) {
				targets.push.apply( targets, x.meshes );
			}
		} );
		const hits = this.ray.intersectObjects( targets, false );
		return hits[ 0 ] || null;
	}

	clickAt( x, y ) {
		const hit = this.pick( x, y );
		if ( ! hit ) {
			return;
		}
		const ud = hit.object.userData;
		if ( ud.addonClick ) {
			ud.addonClick();
		} else if ( ud.productId ) {
			this.o.onProduct( ud.productId );
		} else if ( ud.counter ) {
			this.walkToCounter();
		} else if ( ud.floor ) {
			this.walkTo( hit.point.x, hit.point.z, null );
		}
	}

	/** Enter/Space: act on whatever is in the middle of the view (or the product just beside it). */
	interactAhead() {
		const r = this.canvas.getBoundingClientRect();
		const cx = r.left + r.width / 2;
		const cy = r.top + r.height / 2;
		let hit = this.pick( cx, cy );
		const product = ( h ) => h && h.object.userData.productId && h.distance < 6;
		if ( ! product( hit ) && ! ( hit && ( hit.object.userData.addonClick || hit.object.userData.counter ) && hit.distance < 8 ) ) {
			// The middle of the view falls between two products (the shelves themselves can't be
			// chosen): take the nearest product just beside it, closest rings first.
			const step = Math.min( r.width, r.height ) * 0.06;
			const rings = [ [ 1, 0 ], [ -1, 0 ], [ 0, 1 ], [ 0, -1 ], [ 1, 1 ], [ -1, 1 ], [ 1, -1 ], [ -1, -1 ], [ 2, 0 ], [ -2, 0 ] ];
			for ( const [ dx, dy ] of rings ) {
				const near = this.pick( cx + dx * step, cy + dy * step );
				if ( product( near ) ) {
					hit = near;
					break;
				}
			}
		}
		if ( product( hit ) ) {
			this.o.onProduct( hit.object.userData.productId );
		} else if ( hit && hit.object.userData.addonClick && hit.distance < 8 ) {
			hit.object.userData.addonClick(); // An add-on's clickable thing (a fixture's picture, a guide).
		} else if ( hit && hit.object.userData.counter ) {
			this.walkToCounter();
		} else {
			this.o.onNothingAhead();
		}
	}

	hover() {
		if ( ! this.hoverAt || this.drag ) {
			return;
		}
		const [ x, y ] = this.hoverAt;
		this.hoverAt = null;
		const hit = this.pick( x, y );
		const id = hit && hit.object.userData.productId;
		this.hoverAddonAt( hit && typeof hit.object.userData.addonHover === 'function' ? hit.object.userData.addonHover : null );
		this.canvas.style.cursor = id || ( hit && ( hit.object.userData.addonClick || hit.object.userData.counter ) ) ? 'pointer' : ( hit && hit.object.userData.floor ? 'crosshair' : '' );
		if ( ! id ) {
			this.tip.hidden = true;
			return;
		}
		const product = this.products.get( id );
		if ( ! product ) {
			return;
		}
		const info = this.o.describe( product );
		this.tip.textContent = '';
		const name = el( 'strong' );
		name.textContent = info.name;
		const price = el( 'span' );
		price.textContent = info.price;
		const hint = el( 'em' );
		hint.textContent = this.t.clickToView;
		this.tip.append( name, price, hint );
		const r = this.canvas.getBoundingClientRect();
		this.tip.style.left = Math.min( r.width - 220, x - r.left + 14 ) + 'px';
		this.tip.style.top = Math.max( 8, y - r.top - 70 ) + 'px';
		this.tip.hidden = false;
	}

	/* ----------------------------------------------------------- Movement */

	forward() {
		const y = this.body.rotation.y;
		return { x: -Math.sin( y ), z: -Math.cos( y ) };
	}

	/** Whether the shopper (a circle) can stand at (x, z), and the trolley fits somewhere ahead. */
	blockedAt( x, z, yaw ) {
		const L = this.L;
		const r = BODY_R;
		if ( x < L.xMin + r || x > L.xMax - r || z > -0.5 - r || z < -L.dBack + r ) {
			return true;
		}
		const hit = this.obstacles.some( ( o ) => {
			const cx = Math.max( o.minX, Math.min( x, o.maxX ) );
			const cz = Math.max( o.minZ, Math.min( z, o.maxZ ) );
			return ( x - cx ) * ( x - cx ) + ( z - cz ) * ( z - cz ) < r * r;
		} );
		// A solid add-on object (the guide robot) blocks the shopper too, unless it is already
		// touching them (it floated in): then they can still move away.
		const solid = ! this.bodyInSolid && this.bodyHitsSolid( x, z );
		// A trolley with no room where the shopper already stands (just taken back beside a shelf)
		// never traps them: they can walk away until it fits again.
		return hit || solid || ( this.rig.trolley && ! this.trolleyStuck && ! this.trolleyPoseAt( x, z, yaw ) );
	}

	/**
	 * The trolley's footprint for a shopper at (x, z) facing yaw, in pose { swivel, reach }: a
	 * rectangle { cx, cz, ux, uz, hl, hw } (centre, unit axis along its length, half length and width).
	 */
	trolleyRect( x, z, yaw, pose ) {
		const fx = -Math.sin( yaw );
		const fz = -Math.cos( yaw );
		const ux = -Math.sin( yaw + pose.swivel );
		const uz = -Math.cos( yaw + pose.swivel );
		// The handle stays in the shopper's hands; the trolley turns about it.
		const hx = x + fx * ( pose.reach - HANDLE );
		const hz = z + fz * ( pose.reach - HANDLE );
		const off = HANDLE + ( FOOT.front - FOOT.back ) / 2;
		return { cx: hx + ux * off, cz: hz + uz * off, ux, uz, hl: ( FOOT.front + FOOT.back ) / 2, hw: FOOT.hw };
	}

	/** Whether the trolley in pose { swivel, reach } fits, for a shopper at (x, z) facing yaw. */
	trolleyFits( x, z, yaw, pose ) {
		const L = this.L;
		const { cx, cz, ux, uz, hl, hw } = this.trolleyRect( x, z, yaw, pose );
		// Its corners inside the walls.
		for ( const [ a, b ] of [ [ 1, 1 ], [ 1, -1 ], [ -1, 1 ], [ -1, -1 ] ] ) {
			const px = cx + ux * hl * a - uz * hw * b;
			const pz = cz + uz * hl * a + ux * hw * b;
			if ( px < L.xMin + 0.05 || px > L.xMax - 0.05 || pz > -0.05 || pz < -L.dBack + 0.05 ) {
				return false;
			}
		}
		// Nothing solid in the way: the store, and add-on objects that asked to be solid (the guide robot).
		return ! this.obstacles.some( ( o ) => rectHitsBox( cx, cz, ux, uz, hl, hw, o ) ) &&
			! this.solids().some( ( s ) => rectHitsCircle( cx, cz, ux, uz, hl, hw, s.x, s.z, s.r ) );
	}

	/**
	 * Add-on objects added with opts.solid (a radius): { x, z, r } for each one shown now. The
	 * shopper and the trolley go round them, as round a shelf end.
	 */
	solids() {
		const out = [];
		this.extras.forEach( ( e ) => {
			const o = e.object;
			if ( e.solid > 0 && o.visible && o.scale.x > 0.5 && o.parent ) {
				out.push( { x: o.position.x, z: o.position.z, r: e.solid * o.scale.x } );
			}
		} );
		return out;
	}

	/** Whether the shopper's body at (x, z) touches a solid add-on object. */
	bodyHitsSolid( x, z ) {
		return this.solids().some( ( s ) => Math.hypot( x - s.x, z - s.z ) < BODY_R + s.r );
	}

	/**
	 * Before a move or turn: a solid add-on object may have floated into the shopper or the trolley
	 * since the last one. Then they are let out (as with a trolley taken back beside a shelf), never
	 * trapped.
	 */
	refreshContacts() {
		const p = this.body.position;
		const near = this.solids().filter( ( s ) => Math.hypot( s.x - p.x, s.z - p.z ) < 3 );
		this.bodyInSolid = near.length > 0 && this.bodyHitsSolid( p.x, p.z );
		if ( near.length && this.rig.trolley ) {
			this.trolleyStuck = ! this.trolleyPoseAt( p.x, p.z, this.body.rotation.y );
		}
	}

	/**
	 * For add-ons: whether a circle of radius r at (x, z) touches the shopper or the trolley as it
	 * is drawn now. A guide robot uses it to keep out of the way.
	 */
	touchesShopper( x, z, r ) {
		const p = this.body.position;
		const rad = Number.isFinite( r ) ? r : 0.3;
		if ( Math.hypot( x - p.x, z - p.z ) < BODY_R + rad ) {
			return true;
		}
		if ( ! this.rig.trolley || ! this.trolley || ! this.trolley.visible ) {
			return false;
		}
		const t = this.trolleyRect( p.x, p.z, this.body.rotation.y, this.pose );
		return rectHitsCircle( t.cx, t.cz, t.ux, t.uz, t.hl, t.hw, x, z, rad );
	}

	/**
	 * The trolley pose that fits for a shopper at (x, z) facing yaw: straight ahead at arm's length
	 * when there is room, otherwise angled away and / or pulled in, as a shopper steers a trolley
	 * past a shelf end. Prefers poses near the current one, so the trolley never flips sides. null
	 * when none fits.
	 */
	trolleyPoseAt( x, z, yaw ) {
		const now = this.poseTarget;
		let best = null;
		let bestCost = Infinity;
		POSES.forEach( ( pose ) => {
			const cost = Math.abs( pose.swivel ) + ( REACH - pose.reach ) * 1.5 + Math.abs( pose.swivel - now.swivel ) * 0.6;
			if ( cost < bestCost && this.trolleyFits( x, z, yaw, pose ) ) {
				best = pose;
				bestCost = cost;
			}
		} );
		return best;
	}

	/**
	 * Turn by da radians, as far as the shopper and trolley fit (the trolley may angle away): the
	 * whole turn, or else half, a quarter or an eighth of it. Returns whether it turned at all.
	 */
	turnBy( da ) {
		const p = this.body.position;
		this.refreshContacts();
		for ( let part = da, i = 0; i < 4; i++, part /= 2 ) {
			const yaw = this.body.rotation.y + part;
			if ( ! this.blockedAt( p.x, p.z, yaw ) ) {
				this.body.rotation.y = yaw;
				return true;
			}
		}
		return false;
	}

	/** After a move or turn: where the trolley should be drawn now. */
	settleTrolley() {
		if ( ! this.rig.trolley ) {
			return;
		}
		const p = this.body.position;
		const pose = this.trolleyPoseAt( p.x, p.z, this.body.rotation.y );
		this.trolleyStuck = ! pose;
		this.poseTarget = pose || this.poseTarget;
	}

	/** Ease the drawn trolley towards its target pose; returns whether it is still moving. */
	easeTrolley( dt ) {
		const t = this.poseTarget;
		const k = this.o.reducedMotion() ? 1 : Math.min( 1, dt * 9 );
		const ds = t.swivel - this.pose.swivel;
		const dr = t.reach - this.pose.reach;
		if ( Math.abs( ds ) < 1e-3 && Math.abs( dr ) < 1e-3 ) {
			if ( ds || dr ) {
				this.pose = { swivel: t.swivel, reach: t.reach };
				this.placeTrolley();
			}
			return false;
		}
		this.pose = { swivel: this.pose.swivel + ds * k, reach: this.pose.reach + dr * k };
		// Easing is only for open space: a pose on the way that would touch something is skipped.
		const p = this.body.position;
		if ( this.rig.trolley && ! this.trolleyStuck && ! this.trolleyFits( p.x, p.z, this.body.rotation.y, this.pose ) ) {
			this.pose = { swivel: t.swivel, reach: t.reach };
		}
		this.placeTrolley();
		return true;
	}

	/** Put the trolley at its drawn pose, turned about the handle. */
	placeTrolley() {
		const { swivel, reach } = this.pose;
		this.trolley.rotation.y = swivel;
		this.trolley.position.x = -Math.sin( swivel ) * HANDLE;
		this.trolley.position.z = -( reach - HANDLE ) - Math.cos( swivel ) * HANDLE;
	}

	/** Move by (dx, dz), sliding along whatever is in the way. Returns the distance moved. */
	step( dx, dz ) {
		const p = this.body.position;
		const yaw = this.body.rotation.y;
		this.refreshContacts();
		if ( ! this.blockedAt( p.x + dx, p.z + dz, yaw ) ) {
			p.x += dx;
			p.z += dz;
			return Math.hypot( dx, dz );
		}
		if ( Math.abs( dx ) > 1e-4 && ! this.blockedAt( p.x + dx, p.z, yaw ) ) {
			p.x += dx;
			return Math.abs( dx );
		}
		if ( Math.abs( dz ) > 1e-4 && ! this.blockedAt( p.x, p.z + dz, yaw ) ) {
			p.z += dz;
			return Math.abs( dz );
		}
		return 0;
	}

	/** Aisle index whose walkway contains (x, depth), or -1. */
	aisleAt( x, d ) {
		const L = this.L;
		if ( d < L.d1 - 0.4 || d > L.d2 + 0.4 ) {
			return -1;
		}
		const i = Math.floor( x / SHELF.pitch );
		if ( i < 0 || i >= L.n ) {
			return -1;
		}
		return Math.abs( x - L.aisleX( i ) ) < SHELF.pitch / 2 - SHELF.depth / 2 ? i : -1;
	}

	/** Waypoints along the store's walkways (cross-aisles) from here to (x, z). */
	route( x, z ) {
		const L = this.L;
		const p = this.body.position;
		const from = this.aisleAt( p.x, -p.z );
		const to = this.aisleAt( x, -z );
		const pts = [];
		if ( from >= 0 && from !== to ) {
			const back = -p.z > ( L.d1 + L.d2 ) / 2 && to >= 0;
			const exitD = back ? L.dBackCross : L.dCross;
			pts.push( [ p.x, -exitD ] );
			if ( to >= 0 ) {
				pts.push( [ L.aisleX( to ), -exitD ] );
			} else {
				pts.push( [ x, -exitD ] );
			}
		} else if ( to >= 0 && from !== to ) {
			const cross = -p.z > L.d2 ? L.dBackCross : L.dCross;
			pts.push( [ p.x, -cross ] );
			pts.push( [ L.aisleX( to ), -cross ] );
		}
		pts.push( [ x, z ] );
		return pts;
	}

	walkTo( x, z, yaw ) {
		const pts = this.route( x, z );
		if ( this.o.reducedMotion() ) {
			this.body.position.set( x, 0, z );
			if ( null !== yaw ) {
				this.body.rotation.y = yaw;
			}
			this.auto = null;
			this.afterMove( true );
			this.request();
			return;
		}
		this.auto = { pts, yaw };
		this.request();
	}

	walkToAisle( i ) {
		const L = this.L;
		const fromBack = -this.body.position.z > L.d2;
		// On narrow portrait screens, looking straight down the aisle shows neither shelf, so
		// arrive turned towards the left-hand shelf.
		const turn = this.camera.aspect < 0.8 ? 0.62 : 0;
		this.walkTo( L.aisleX( i ), fromBack ? -( L.d2 - 1.1 ) : -( L.d1 + 1.1 ), ( fromBack ? Math.PI : 0 ) + turn );
	}

	teleportToAisle( i ) {
		this.body.position.set( this.L.aisleX( i ), 0, -( this.L.d1 + 1.1 ) );
		this.body.rotation.y = 0;
	}

	walkToCounter() {
		// Stand at the head of the checkout lane, facing the counters and the exit.
		this.walkTo( this.L.laneX, -( this.L.counterD[ 1 ] + 1.3 ), Math.PI );
	}

	update( dt ) {
		let active = false;
		let moved = 0;
		const k = this.keys;
		const run = k.has( 'ShiftLeft' ) || k.has( 'ShiftRight' );
		let fwd = ( k.has( 'KeyW' ) || k.has( 'ArrowUp' ) ? 1 : 0 ) - ( k.has( 'KeyS' ) || k.has( 'ArrowDown' ) ? 1 : 0 );
		const strafe = ( k.has( 'KeyD' ) ? 1 : 0 ) - ( k.has( 'KeyA' ) ? 1 : 0 );
		let turn = ( k.has( 'ArrowLeft' ) || k.has( 'KeyQ' ) ? 1 : 0 ) - ( k.has( 'ArrowRight' ) || k.has( 'KeyE' ) ? 1 : 0 );
		if ( this.stick ) {
			fwd = -this.stick.y;
			turn = -this.stick.x * 0.9;
		}
		if ( turn ) {
			this.turnBy( turn * TURN * dt );
			active = true;
		}
		if ( fwd || strafe ) {
			const f = this.forward();
			const speed = ( run ? RUN : WALK ) * dt;
			const dx = ( f.x * fwd + -f.z * strafe ) * speed;
			const dz = ( f.z * fwd + f.x * strafe ) * speed;
			moved += this.step( dx, dz );
			active = true;
		}

		if ( this.auto ) {
			active = true;
			const p = this.body.position;
			const [ tx, tz ] = this.auto.pts[ 0 ];
			const dist = Math.hypot( tx - p.x, tz - p.z );
			if ( dist < 0.08 ) {
				this.auto.pts.shift();
				if ( ! this.auto.pts.length ) {
					if ( null === this.auto.yaw || undefined === this.auto.yaw ) {
						this.auto = null;
					} else {
						this.auto.turnOnly = true;
						this.auto.pts.push( [ p.x, p.z ] );
					}
				}
			} else if ( ! this.auto.turnOnly ) {
				const heading = Math.atan2( -( tx - p.x ), -( tz - p.z ) );
				const da = angleTo( this.body.rotation.y, heading );
				if ( ! this.turnBy( Math.sign( da ) * Math.min( Math.abs( da ), 4.5 * dt ) ) ) {
					this.auto.stuck = ( this.auto.stuck || 0 ) + dt;
				}
				if ( Math.abs( da ) < 0.9 ) {
					const len = Math.min( dist, AUTO * dt );
					const got = this.step( ( ( tx - p.x ) / dist ) * len, ( ( tz - p.z ) / dist ) * len );
					moved += got;
					if ( got < len * 0.2 && this.auto.pts.length > 1 && dist < 1.2 ) {
						// Blocked just short of a corner (furniture by the walkway catches the trolley):
						// cut the corner and carry on with the next leg.
						this.auto.pts.shift();
						this.auto.stuck = 0;
					} else if ( got < len * 0.2 ) {
						this.auto.stuck = ( this.auto.stuck || 0 ) + dt;
						if ( this.auto.stuck > 0.6 ) {
							this.auto = null; // Something is in the way; let the shopper steer.
						}
					}
				}
			}
			if ( this.auto && this.auto.turnOnly ) {
				const da = angleTo( this.body.rotation.y, this.auto.yaw );
				if ( ! this.turnBy( Math.sign( da ) * Math.min( Math.abs( da ), 3 * dt ) ) ) {
					this.auto.stuck = ( this.auto.stuck || 0 ) + dt;
				}
				if ( Math.abs( da ) < 0.01 || ( this.auto.stuck || 0 ) > 0.6 ) {
					this.auto = null;
				}
			}
			if ( this.auto && ( this.auto.stuck || 0 ) > 0.6 ) {
				this.auto = null; // Something is in the way; let the shopper steer.
			}
		}

		if ( moved ) {
			this.trolley.userData.wheels.forEach( ( w ) => {
				w.rotation.y += moved / 0.05;
			} );
			if ( ! this.o.reducedMotion() ) {
				this.bob = ( this.bob || 0 ) + moved * 5.2;
				this.camera.position.y = this.rig.eye + Math.sin( this.bob ) * 0.018;
			}
		}
		if ( this.bumpT > 0 ) {
			this.bumpT = Math.max( 0, this.bumpT - dt );
			const s = this.bumpT / 0.45;
			this.trolley.position.y = Math.sin( s * Math.PI ) * 0.06;
			active = true;
		}
		if ( moved || turn || this.auto ) {
			this.afterMove( false );
		}
		if ( this.easeTrolley( dt ) ) {
			active = true;
		}
		return active;
	}

	afterMove( force ) {
		this.fitRig();
		this.settleTrolley();
		this.updatePlace( force );
		const now = performance.now();
		if ( force || now - this.lastAisleCheck > 250 ) {
			this.lastAisleCheck = now;
			this.manageAisles( force );
		}
		this.drawMap();
	}

	updatePlace( force ) {
		const p = this.body.position;
		const L = this.L;
		let place = this.aisleAt( p.x, -p.z );
		if ( place < 0 ) {
			place = p.x > L.n * SHELF.pitch + 1.2 && -p.z < L.d1 - 0.3 ? 'counter' : null;
		}
		if ( force || place !== this.place ) {
			this.place = place;
			this.where.textContent = 'counter' === place ? this.t.checkoutCounter : ( null === place ? this.t.lobby : this.t.aisleN.replace( '%1$d', place + 1 ).replace( '%2$s', this.sections[ place ].label ) );
			this.o.onPlace( place );
		}
	}

	/**
	 * Add-on HTML (addHtml) is drawn over the store by the CSS 3D layer while any of it shows.
	 * The trolley, and add-on objects added with front, move to the trolley's canvas above that
	 * layer while they overlap HTML that shows (checked at most every 150 ms). Returns whether
	 * the layer needs drawing.
	 */
	updateOverlays( now ) {
		const shown = this.htmlLayers.filter( ( h ) => h.object.visible );
		if ( ! shown.length ) {
			this.trolleyOverlaps = false;
			this.extras.forEach( ( x ) => ( x.onTop = false ) );
			return false;
		}
		if ( ! this.overlayAt || now - this.overlayAt > 150 ) {
			this.overlayAt = now;
			this.trolleyOverlaps = this.overlapsHtml( shown );
			this.extras.forEach( ( x ) => {
				x.onTop = x.front && x.object.visible && this.overlapsHtml( shown, x.object, true );
			} );
		}
		return true;
	}

	/**
	 * Whether an object (the trolley by default), on screen, overlaps any of this HTML. With
	 * nearer set, only HTML further from the camera than the object counts (the object is in
	 * front of it).
	 */
	overlapsHtml( layers, object, nearer ) {
		const box = this.trolleyBox || ( this.trolleyBox = new Box3() );
		box.setFromObject( object || this.trolley );
		if ( box.isEmpty() ) {
			return false;
		}
		const cam = this.camera.getWorldPosition( this.camPos || ( this.camPos = new Vector3() ) );
		const near = nearer ? box.distanceToPoint( cam ) : 0;
		const r = this.canvas.getBoundingClientRect();
		let x1 = Infinity;
		let y1 = Infinity;
		let x2 = -Infinity;
		let y2 = -Infinity;
		const v = new Vector3();
		[ box.min.x, box.max.x ].forEach( ( x ) => [ box.min.y, box.max.y ].forEach( ( y ) => [ box.min.z, box.max.z ].forEach( ( z ) => {
			v.set( x, y, z ).project( this.camera );
			x1 = Math.min( x1, r.left + ( v.x + 1 ) / 2 * r.width );
			x2 = Math.max( x2, r.left + ( v.x + 1 ) / 2 * r.width );
			y1 = Math.min( y1, r.top + ( 1 - v.y ) / 2 * r.height );
			y2 = Math.max( y2, r.top + ( 1 - v.y ) / 2 * r.height );
		} ) ) );
		const at = new Vector3();
		return layers.some( ( h ) => {
			if ( nearer && h.object.getWorldPosition( at ).distanceTo( cam ) < near + 0.2 ) {
				return false; // The HTML is in front of the object: it rightly covers it.
			}
			const p = h.object.element.getBoundingClientRect(); // Its on-screen box, after the 3D transform.
			return p.right > x1 && p.left < x2 && p.bottom > y1 && p.top < y2;
		} );
	}

	/** The mouse is over an add-on part with onHover (or over none): tell it, and the one it left. */
	hoverAddonAt( fn ) {
		if ( fn === this.hoverAddon ) {
			return;
		}
		const left = this.hoverAddon;
		this.hoverAddon = fn || null;
		[ [ left, false ], [ fn, true ] ].forEach( ( [ f, on ] ) => {
			if ( f ) {
				try {
					f( on );
				} catch ( error ) {
					console.warn( 'Aisleza: an add-on hover handler failed.', error ); // eslint-disable-line no-console
				}
			}
		} );
	}

	/**
	 * For add-ons: whether a flat thing w × h metres (a plane mesh facing its +z) is really in view:
	 * within opts.far metres (16), facing the camera (opts.facing, 0.2: the cosine of the angle),
	 * on screen (its centre within opts.edge, 1, of the view's half-size) and with nothing the
	 * shopper cannot walk through in between (see clearSight).
	 */
	canSee( mesh, w, h, opts ) {
		if ( ! mesh || ! mesh.isObject3D ) {
			return false;
		}
		const o = opts || {};
		const far = Number.isFinite( o.far ) ? o.far : 16;
		const facing = Number.isFinite( o.facing ) ? o.facing : 0.2;
		const edge = Number.isFinite( o.edge ) ? o.edge : 1;
		const cam = this.camera.getWorldPosition( this.camPos || ( this.camPos = new Vector3() ) );
		const at = mesh.getWorldPosition( new Vector3() );
		const toCam = cam.clone().sub( at );
		if ( toCam.length() > far || mesh.getWorldDirection( new Vector3() ).dot( toCam.normalize() ) < facing ) {
			return false;
		}
		const ndc = at.project( this.camera );
		return ndc.z < 1 && Math.abs( ndc.x ) < edge && Math.abs( ndc.y ) < edge && this.clearSight( cam, mesh, w, h );
	}

	/**
	 * Nothing between the camera and a flat thing's centre and corners (a plane mesh w × h). The
	 * test uses the boxes of the things the shopper cannot walk through (shelving, displays, trees,
	 * counters; up to shelving height), not the full geometry: far cheaper on phones, and walls
	 * never stand between a shopper inside the store and the walls. The shopper's own trolley does
	 * not count.
	 */
	clearSight( cam, mesh, w, h ) {
		if ( ! this.sightBoxes ) {
			this.sightBoxes = this.obstacles.map( ( o ) => new Box3( new Vector3( o.minX, 0, o.minZ ), new Vector3( o.maxX, 2.4, o.maxZ ) ) );
		}
		const points = [ [ 0, 0 ], [ -0.42, -0.4 ], [ 0.42, -0.4 ], [ -0.42, 0.4 ], [ 0.42, 0.4 ] ];
		const ray = this.sightLine || ( this.sightLine = new Ray() );
		const hit = new Vector3();
		return points.every( ( [ u, v ] ) => {
			const target = mesh.localToWorld( new Vector3( u * w, v * h, 0.01 ) );
			const far = target.distanceTo( cam ) - 0.1;
			ray.set( cam, target.clone().sub( cam ).normalize() );
			return ! this.sightBoxes.some( ( box ) => box.distanceToPoint( target ) > 0.08 && ray.intersectBox( box, hit ) && hit.distanceTo( cam ) < far );
		} );
	}

	/**
	 * Build, in the background, the shaders a stocked aisle will need (one of everything an aisle
	 * draws, out of sight below the floor), so walking up to the first aisle never freezes the
	 * store while the browser compiles them.
	 */
	warmShaders() {
		const w = this.shelves.warmup( this.o.accent );
		w.group.position.y = -60; // Below the floor: out of every view.
		this.scene.add( w.group );
		this.prepare( w.group ).then( () => {
			// Compiled is not enough: browsers (ANGLE on Windows) finish a shader on its first real
			// draw. Draw them down there (never culled, never seen), two objects a frame so no frame
			// takes long, then let go.
			w.group.traverse( ( o ) => ( o.frustumCulled = false ) );
			const items = w.group.children.slice();
			items.forEach( ( o ) => ( o.visible = false ) );
			this.warm = { group: w.group, free: w.free, items, next: 0 };
			this.request();
		} );
	}

	/**
	 * For add-ons too: compile what an object (already in the store, hidden or not) needs to be
	 * drawn, in the background where the browser can, so it shows without a hitch the first time.
	 * Resolves when ready (at once when nothing is left to build).
	 */
	prepare( object ) {
		const r = this.renderer;
		const target = object && object.isObject3D ? object : this.scene;
		const hidden = [];
		target.traverse( ( o ) => {
			if ( ! o.visible ) {
				hidden.push( o );
				o.visible = true; // compile() skips what is hidden.
			}
		} );
		const restore = () => hidden.forEach( ( o ) => ( o.visible = false ) );
		try {
			if ( typeof r.compileAsync === 'function' ) {
				const p = r.compileAsync( target, this.camera, this.scene );
				restore(); // compileAsync reads the objects straight away; they can hide again.
				return p.catch( () => {} );
			}
			r.compile( target, this.camera, this.scene );
		} catch ( e ) {
			// A store that can't precompile still works: shaders build on first use, as before.
		}
		restore();
		return Promise.resolve();
	}

	/** Stock the aisles near the shopper, release the far ones. */
	manageAisles() {
		const p = this.body.position;
		const L = this.L;
		for ( let i = 0; i < L.n; i++ ) {
			const ax = L.aisleX( i );
			const dz = Math.max( 0, Math.max( L.d1 - -p.z, -p.z - L.d2 ) );
			const dist = Math.hypot( ax - p.x, dz );
			const state = this.loaded[ i ];
			if ( dist < 15 && ! state ) {
				this.loaded[ i ] = 'loading';
				this.o.loadAisle( i ).then( ( products ) => {
					if ( 'loading' !== this.loaded[ i ] ) {
						return;
					}
					products.forEach( ( pr ) => this.products.set( pr.id, pr ) );
					const a = this.shelves.populate( i, products, this.sections[ i ].accent || this.o.accent );
					this.scene.add( a.group );
					this.loaded[ i ] = 'ready';
					this.request();
				}, () => {
					delete this.loaded[ i ]; // Try again on the next approach.
				} );
			} else if ( dist > 32 && state ) {
				const g = this.shelves.release( i );
				if ( g ) {
					this.scene.remove( g );
				}
				delete this.loaded[ i ];
			}
		}
	}

	/* ------------------------------------------------------------ Minimap */

	drawMap() {
		const L = this.L;
		const w = 176;
		const s = w / ( L.xMax - L.xMin );
		const h = Math.round( L.dBack * s );
		this.mapScale = s;
		const dpr = window.devicePixelRatio || 1;
		if ( this.map.width !== Math.round( w * dpr ) ) {
			this.map.width = Math.round( w * dpr );
			this.map.height = Math.round( h * dpr );
			this.map.style.width = w + 'px';
			this.map.style.height = h + 'px';
		}
		const ctx = this.map.getContext( '2d' );
		ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
		ctx.clearRect( 0, 0, w, h );
		ctx.fillStyle = 'rgba(255,255,255,.92)';
		ctx.fillRect( 0, 0, w, h );
		const X = ( x ) => ( x - L.xMin ) * s;
		this.sections.forEach( ( sec, i ) => {
			ctx.fillStyle = sec.accent || this.o.accent;
			ctx.globalAlpha = i === this.place ? 0.55 : 0.22;
			ctx.fillRect( X( L.gondolaX( i ) + SHELF.depth / 2 ), L.d1 * s, ( SHELF.pitch - SHELF.depth ) * s, L.length * s );
			ctx.globalAlpha = 1;
			ctx.fillStyle = '#1b2440';
			ctx.font = '700 10px system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText( String( i + 1 ), X( L.aisleX( i ) ), ( L.d1 - 0.4 ) * s );
		} );
		ctx.fillStyle = '#7a5433';
		for ( let k = 0; k <= L.n; k++ ) {
			ctx.fillRect( X( L.gondolaX( k ) - SHELF.depth / 2 ), L.d1 * s, SHELF.depth * s, L.length * s );
		}
		ctx.fillStyle = '#1e8467';
		L.lanes.forEach( ( x ) => ctx.fillRect( X( x - 0.4 ), L.counterD[ 0 ] * s, 0.8 * s, ( L.counterD[ 1 ] - L.counterD[ 0 ] ) * s ) );
		ctx.fillStyle = '#1b2440';
		ctx.fillRect( X( L.start.x - 1.7 ), 0, 3.4 * s, 2 );
		const p = this.body.position;
		const y = this.body.rotation.y;
		ctx.save();
		ctx.translate( X( p.x ), -p.z * s );
		ctx.rotate( Math.PI + y ); // Entrance at the top: facing into the store points down.
		ctx.fillStyle = '#c2412d';
		ctx.beginPath();
		ctx.moveTo( 0, -7 );
		ctx.lineTo( 5, 5 );
		ctx.lineTo( 0, 2 );
		ctx.lineTo( -5, 5 );
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}

	/* -------------------------------------------------------------- Frame */

	resize() {
		const w = Math.max( 1, this.box.clientWidth );
		const h = Math.max( 1, this.box.clientHeight );
		const ratio = Math.max( 0.5, Math.min( this.maxRatio, Math.sqrt( this.pixelBudget / ( w * h ) ) ) * this.quality );
		if ( Math.abs( ratio - this.renderer.getPixelRatio() ) > 0.01 ) {
			this.renderer.setPixelRatio( ratio );
			this.trolleyRenderer.setPixelRatio( ratio );
		}
		this.renderer.setSize( w, h, false );
		if ( this.q ) {
			// A new size (full screen, a rotated phone) takes the browser a moment: judge afresh after it.
			this.q.at = performance.now();
			this.q.pending = 0; // This size already uses the current quality.
			this.q.gaps.length = 0;
			this.q.sum = 0;
		}
		this.css.setSize( w, h );
		this.trolleyRenderer.setSize( w, h, false );
		this.camera.aspect = w / h;
		this.camera.fov = w / h < 0.8 ? 74 : 62;
		this.camera.updateProjectionMatrix();
		this.request();
	}

	/**
	 * Keep moving smooth on a weak graphics chip: while the shopper moves, compare the time between
	 * frames with the screen's own refresh interval. Sustained slow frames lower the drawing
	 * resolution a step (down to 55 %); sustained quick ones raise it again. Changes are seconds
	 * apart, so the picture never flickers between sizes. A new resolution rebuilds the drawing
	 * buffers (a pause of up to a tenth of a second), so it waits until the shopper stops, unless
	 * they keep moving for 5 s.
	 */
	adaptQuality( now, active ) {
		const q = this.q || ( this.q = { last: 0, moving: false, gaps: [], sum: 0, base: 1000, quick: 0, at: 0, pending: 0 } );
		if ( q.pending && ( ! active || now - q.pending > 5000 ) ) {
			this.resize();
		}
		const gap = now - q.last;
		const counts = active && q.moving; // Only the gap between two moving frames counts, however long.
		q.last = now;
		q.moving = active;
		if ( ! counts ) {
			if ( ! active ) {
				q.gaps.length = 0;
				q.sum = 0;
			}
			return;
		}
		q.base = Math.max( 6, Math.min( q.base, gap ) ); // The refresh interval (16.7 ms at 60 Hz).
		q.gaps.push( gap );
		q.sum += gap;
		// Judge about a second of moving (at least 8 frames), whatever the frame rate.
		if ( q.sum < 1000 || q.gaps.length < 8 ) {
			return;
		}
		// The typical frame (median): a one-off pause, like an aisle stocking its shelves, never counts.
		const sorted = q.gaps.slice().sort( ( x, y ) => x - y );
		const avg = sorted[ Math.floor( sorted.length / 2 ) ];
		q.gaps.length = 0;
		q.sum = 0;
		let next = this.quality;
		if ( now - q.at < 2000 ) {
			return; // Just resized (or changed quality): wait for the browser to settle.
		}
		if ( avg > Math.max( 22, q.base * 1.6 ) ) {
			// Very slow frames step down harder.
			next = Math.max( 0.55, this.quality * ( avg > Math.max( 60, q.base * 4 ) ? 0.7 : 0.85 ) );
			q.quick = 0;
		} else if ( avg < q.base * 1.2 ) {
			q.quick++;
			if ( q.quick >= 3 && this.quality < 1 && now - q.at > 3000 ) {
				next = Math.min( 1, this.quality * 1.1 );
				q.quick = 0;
			}
		} else {
			q.quick = 0;
		}
		if ( next !== this.quality ) {
			this.quality = next;
			q.at = now;
			q.pending = q.pending || now;
		}
	}

	request() {
		this.dirty = true;
		if ( ! this.raf && ! this.destroyed ) {
			this.last = performance.now();
			this.raf = requestAnimationFrame( ( t ) => this.frame( t ) );
		}
	}

	frame( now ) {
		this.raf = 0;
		if ( this.destroyed || document.hidden ) {
			return;
		}
		const dt = Math.min( 0.05, ( now - this.last ) / 1000 );
		this.last = now;
		let active = this.update( dt );
		this.savePose( false ); // Remembered for a refresh (only when it changed; at most twice a second).
		this.adaptQuality( now, active );
		this.tickers.slice().forEach( ( fn ) => {
			try {
				if ( fn( dt, now ) ) {
					active = true; // The add-on is animating: keep drawing.
					this.dirty = true;
				}
			} catch ( error ) {
				this.tickers = this.tickers.filter( ( f ) => f !== fn );
				console.warn( 'Aisleza: an add-on animation failed and was stopped.', error ); // eslint-disable-line no-console
			}
		} );
		// While the view moves under a still mouse, look again at what is under it (now and then).
		if ( active && this.mouseAt && ! this.hoverAt && ( ! this.repickAt || now - this.repickAt > 120 ) ) {
			this.repickAt = now;
			this.hoverAt = this.mouseAt;
		}
		this.hover();
		if ( this.dirty || active ) {
			// The trolley goes on its own canvas only while it overlaps add-on HTML that shows.
			const onTop = !! this.trolleyOverlaps;
			if ( onTop !== this.trolleyOnTop ) {
				this.trolleyOnTop = onTop;
				( onTop ? this.trolleyRig : this.body ).add( this.trolley );
			}
			// Add-on objects (with front) in front of that HTML join the trolley's canvas the same way.
			let extrasOnTop = false;
			this.extras.forEach( ( x ) => {
				const top = x.onTop && x.object.visible;
				if ( top !== x.drawnOnTop ) {
					x.drawnOnTop = top;
					( top ? this.trolleyScene : this.scene ).add( x.object );
				}
				extrasOnTop = extrasOnTop || top;
			} );
			if ( ! onTop && ! extrasOnTop && this.overlayDrawn ) {
				this.trolleyRenderer.clear();
			}
			this.overlayDrawn = onTop || extrasOnTop;
			this.renderer.render( this.scene, this.camera );
			// The shader warm-up (warmShaders): a couple of real draws, then it goes.
			if ( this.warm ) {
				// The objects just drawn rest; the next two take their turn.
				const wm = this.warm;
				wm.items.forEach( ( o, k ) => ( o.visible = k >= wm.next && k < wm.next + 2 ) );
				wm.next += 2;
				wm.frames = wm.next > wm.items.length + 1 ? 0 : 1;
				// The trolley's own canvas (used in front of add-on HTML) has its own
				// shaders: draw the trolley there once now and clear it in the same frame (nothing
				// shows), so moving onto it later doesn't freeze the store for a moment.
				if ( ! this.warm.trolley && ! onTop && this.rig.trolley ) {
					this.warm.trolley = true;
					this.trolleyRig.position.copy( this.body.position );
					this.trolleyRig.quaternion.copy( this.body.quaternion );
					this.trolleyRig.add( this.trolley );
					this.trolleyRenderer.render( this.trolleyScene, this.camera );
					this.trolleyRenderer.clear();
					this.body.add( this.trolley );
				}
				if ( this.warm.frames <= 0 ) {
					this.scene.remove( this.warm.group );
					this.warm.free();
					this.warm = null;
					this.warmed = true; // Read by the browser checks.
				} else {
					this.request();
				}
			}
			if ( onTop || extrasOnTop ) {
				this.trolleyRig.position.copy( this.body.position );
				this.trolleyRig.quaternion.copy( this.body.quaternion );
				this.trolleyRenderer.render( this.trolleyScene, this.camera );
			}
			if ( this.updateOverlays( now ) ) {
				this.css.render( this.cssScene, this.camera );
			}
			this.dirty = false;
			this.frames = ( this.frames || 0 ) + 1;
		}
		// One drawing loop only: a redraw asked for during this frame (an add-on) has
		// already scheduled the next one.
		if ( active && ! this.raf ) {
			this.raf = requestAnimationFrame( ( t ) => this.frame( t ) );
		}
		if ( ! this.drawnMap ) {
			this.drawnMap = true;
			this.drawMap();
		}
	}

	/* ---------------------------------------------------------- Public API */

	setCart( items ) {
		if ( fillTrolley( this.trolley, items, this.o.accent, this.o.packLabels, () => this.request() ) ) {
			this.request();
		}
	}

	bump() {
		this.bumpT = this.o.reducedMotion() ? 0 : 0.45;
		this.request();
	}

	setEligible( id, flag ) {
		this.shelves.setEligible( id, flag );
	}

	focus() {
		this.canvas.focus( { preventScroll: true } );
	}

	/**
	 * The store logo, when the page config has one (an add-on's branding): above the doors and
	 * on the trolley handle, beside the name. Until it loads, or if it can't be used (a picture
	 * from another site that doesn't allow it), both show the name alone.
	 */
	showLogo( doorSign ) {
		const logo = this.o.logo;
		if ( ! logo || ! logo.url ) {
			return;
		}
		const img = new Image();
		img.crossOrigin = 'anonymous'; // A picture from another site must allow use in WebGL.
		img.decoding = 'async';
		img.onload = () => {
			if ( this.destroyed ) {
				return;
			}
			const old = doorSign.material.map;
			doorSign.material.map = toTexture( plaqueCanvas( this.skin, this.o.storeName, 1280, 200, null, img ) );
			old.dispose();
			brandTrolley( this.trolley, this.o.accent, this.o.storeName, img );
			this.request();
		};
		img.src = logo.url;
	}

	/** Where the shopper stands and looks, to rebuild the store around the same view. */
	getView() {
		return { x: this.body.position.x, z: this.body.position.z, yaw: this.body.rotation.y, pitch: this.camera.rotation.x };
	}

	/** A short fingerprint of the store's shape: a remembered spot only counts in the same store. */
	layoutKey() {
		const L = this.L;
		return [ L.n, L.xMin, L.xMax, L.dBack, L.d1, L.d2 ].map( ( v ) => Math.round( v * 100 ) / 100 ).join( '|' );
	}

	/**
	 * Put the shopper (and so the trolley) back exactly where they left it before a page refresh
	 * (opts.startPose: what opts.onPose was last given), when that spot belongs to this store and
	 * is still clear. Returns whether it did; if not, the shopper stays at the entrance.
	 */
	restorePose( p ) {
		if ( ! p || p.layout !== this.layoutKey() || ! [ p.x, p.z, p.yaw ].every( Number.isFinite ) || this.blockedAt( p.x, p.z, p.yaw ) ) {
			return false;
		}
		const pitch = Number.isFinite( p.pitch ) ? Math.max( -0.75, Math.min( 0.5, p.pitch ) ) : this.camera.rotation.x;
		this.setView( { x: p.x, z: p.z, yaw: p.yaw, pitch } );
		this.settleTrolley();
		this.pose = Object.assign( {}, this.poseTarget ); // The trolley at its spot at once, not easing there.
		this.placeTrolley();
		this.restoredPitch = pitch; // Applied again after add-ons set their camera views.
		return true;
	}

	/**
	 * Tell the page where the shopper is now (opts.onPose), so a refresh can put them back: at most
	 * twice a second while they move, once more when they stop, and at once when the page is left.
	 */
	savePose( force ) {
		if ( typeof this.o.onPose !== 'function' || this.destroyed ) {
			return;
		}
		const v = this.getView();
		const key = [ v.x, v.z, v.yaw, v.pitch ].map( ( n ) => n.toFixed( 3 ) ).join( ',' );
		if ( key === this.savedPoseKey ) {
			return;
		}
		const now = performance.now();
		if ( ! force && now - ( this.savedPoseAt || 0 ) < 500 ) {
			// Too soon: save the latest spot shortly instead (the store may stop drawing meanwhile).
			if ( ! this.poseTimer ) {
				this.poseTimer = setTimeout( () => {
					this.poseTimer = 0;
					this.savePose( true );
				}, 520 );
			}
			return;
		}
		this.savedPoseKey = key;
		this.savedPoseAt = now;
		try {
			this.o.onPose( Object.assign( v, { layout: this.layoutKey() } ) );
		} catch ( e ) {
			// Storage is a convenience: a page that can't keep it just starts at the entrance.
		}
	}

	/** Put the shopper back at a view from getView(). */
	setView( v ) {
		if ( ! v || ! [ v.x, v.z, v.yaw, v.pitch ].every( Number.isFinite ) ) {
			return;
		}
		this.auto = null;
		this.body.position.set( v.x, 0, v.z );
		this.body.rotation.y = v.yaw;
		this.camera.rotation.x = v.pitch;
		this.afterMove( true );
		this.request();
	}

	/* ------------------------------------------------------- Add-on actions */

	/**
	 * Run fn( dt, now ) every frame while the store draws; return true from it to keep drawing
	 * (an animation). Returns a function that stops it. A function that throws is stopped.
	 */
	addTicker( fn ) {
		if ( typeof fn !== 'function' ) {
			return () => {};
		}
		this.tickers.push( fn );
		this.request();
		return () => {
			this.tickers = this.tickers.filter( ( f ) => f !== fn );
		};
	}

	/**
	 * Put an add-on's object (a three.js Object3D made with helpers.three) in the store. With
	 * opts.onClick, clicking or tapping any of its meshes calls it; opts.onHover( on ) hears the mouse
	 * come over them and leave. With opts.front, an object that moves about (a guide robot) stays
	 * visible in front of add-on HTML (addHtml, such as a video player), as the trolley does.
	 * Returns a function that removes it.
	 */
	addObject( object, opts ) {
		if ( ! object || ! object.isObject3D ) {
			return () => {};
		}
		const meshes = [];
		const click = opts && typeof opts.onClick === 'function' ? opts.onClick : null;
		const hover = opts && typeof opts.onHover === 'function' ? opts.onHover : null;
		object.traverse( ( o ) => {
			if ( o.isMesh && ( click || hover ) ) {
				if ( click ) {
					o.userData.addonClick = click;
				}
				if ( hover ) {
					o.userData.addonHover = hover;
				}
				meshes.push( o );
			}
		} );
		// opts.solid (a radius in metres): the shopper and trolley go round it (see solids()).
		const solid = opts && Number.isFinite( opts.solid ) && opts.solid > 0 ? Math.min( opts.solid, 2 ) : 0;
		const entry = { object, meshes, front: !! ( opts && opts.front ), solid, onTop: false, drawnOnTop: false };
		this.extras.push( entry );
		this.scene.add( object );
		this.request();
		return () => {
			object.removeFromParent();
			this.extras = this.extras.filter( ( x ) => x !== entry );
			this.request();
		};
	}

	/** Where the shopper stands: { x, z, yaw, walking } (walking: on an automatic walk). */
	shopper() {
		const p = this.body.position;
		return { x: p.x, z: p.z, yaw: this.body.rotation.y, walking: !! this.auto };
	}

	/** Whether a circle of radius r at (x, z) is clear of the walls and everything solid. */
	isFree( x, z, r ) {
		const L = this.L;
		const rad = Number.isFinite( r ) ? r : 0.3;
		if ( x < L.xMin + rad || x > L.xMax - rad || z > -0.5 - rad || z < -L.dBack + rad ) {
			return false;
		}
		return ! this.obstacles.some( ( o ) => {
			const cx = Math.max( o.minX, Math.min( x, o.maxX ) );
			const cz = Math.max( o.minZ, Math.min( z, o.maxZ ) );
			return ( x - cx ) * ( x - cx ) + ( z - cz ) * ( z - cz ) < rad * rad;
		} );
	}

	/**
	 * Where product id stands on a shelf or display that is stocked now: { x, y, z, nx, nz }, with
	 * (nx, nz) the way its front faces; or null (its aisle is not stocked yet, or it is not shown).
	 */
	productSpot( id ) {
		const groups = Object.keys( this.shelves.aisles ).map( ( k ) => this.shelves.aisles[ k ] ).concat( Object.keys( this.shelves.displays ).map( ( k ) => this.shelves.displays[ k ] ) );
		const m = new Matrix4();
		for ( const g of groups ) {
			const mesh = g && g.pickables.find( ( o ) => o.isInstancedMesh && o.userData.productId === id );
			if ( mesh ) {
				mesh.getMatrixAt( 0, m );
				const pos = new Vector3().setFromMatrixPosition( m );
				mesh.localToWorld( pos );
				// A product's printed face is the box's +z side, turned to face the aisle.
				const face = new Vector3( 0, 0, 1 ).applyQuaternion( new Quaternion().setFromRotationMatrix( m ) );
				return { x: pos.x, y: pos.y, z: pos.z, nx: Math.round( face.x * 1000 ) / 1000, nz: Math.round( face.z * 1000 ) / 1000 };
			}
		}
		return null;
	}

	/** Open product id's details, as a click on it would. */
	/**
	 * Lay add-on HTML (a CSS3DObject from helpers.three, such as a video player) over the store, in
	 * step with the camera. It never takes the pointer (the canvas does); while it shows (visible),
	 * the trolley and front objects that overlap it are drawn above it. Returns a function that
	 * removes it.
	 */
	addHtml( object ) {
		if ( ! object || ! object.isCSS3DObject ) {
			return () => {};
		}
		const entry = { object };
		this.htmlLayers.push( entry );
		this.cssScene.add( object );
		this.request();
		return () => {
			this.htmlLayers = this.htmlLayers.filter( ( h ) => h !== entry );
			object.removeFromParent();
			if ( object.element ) {
				object.element.remove();
			}
			this.request();
		};
	}

	/**
	 * An entry in the keyboard and screen-reader list between the aisles: { label, onChoose }.
	 * Entries come before the products there, in the order added. Returns a function that removes it.
	 */
	addListEntry( entry ) {
		if ( ! entry || typeof entry.label !== 'string' || ! entry.label || typeof entry.onChoose !== 'function' ) {
			return () => {};
		}
		const e = { label: entry.label.slice( 0, 160 ), onChoose: entry.onChoose };
		this.lobbyEntries.push( e );
		const changed = () => this.o.onListChange && this.o.onListChange();
		changed();
		return () => {
			this.lobbyEntries = this.lobbyEntries.filter( ( x ) => x !== e );
			changed();
		};
	}

	/** The add-on entries for the keyboard list (see addListEntry). */
	listEntries() {
		return this.lobbyEntries.map( ( e ) => ( { label: e.label, onChoose: e.onChoose } ) );
	}

	/** Say something to screen-reader shoppers (the store's live region). */
	announce( text ) {
		if ( this.o.announce && typeof text === 'string' && text ) {
			this.o.announce( text );
		}
	}

	/** Whether the shopper asked for reduced motion (nothing should start moving or playing on its own). */
	reducedMotion() {
		return !! ( this.o.reducedMotion && this.o.reducedMotion() );
	}

	/** Run fn when the store is taken down (leaving the 3D view): stop videos, remove your HTML. */
	onDestroy( fn ) {
		if ( typeof fn === 'function' ) {
			this.destroyers.push( fn );
		}
	}

	openProduct( id ) {
		if ( Number.isInteger( id ) && id > 0 ) {
			this.o.onProduct( id );
		}
	}

	/**
	 * Where the camera rides, for an add-on's camera views: eye height (m), distance behind the
	 * trolley handle (m), the resting downward tilt (radians) and whether the trolley shows (without
	 * it the shopper walks alone and can step closer to the shelves). Values are kept within safe
	 * limits; anything left out is Boutique's own view. Returns the rig in use.
	 */
	setRig( r ) {
		const o = r && typeof r === 'object' ? r : {};
		const num = ( v, min, max, own ) => ( Number.isFinite( v ) ? Math.min( max, Math.max( min, v ) ) : own );
		this.rig = {
			eye: num( o.eye, 1.2, 2.8, EYE ),
			back: num( o.back, 0, 1.6, 0 ),
			pitch: num( o.pitch, -0.75, 0.3, -0.26 ),
			trolley: false !== o.trolley
		};
		this.camera.position.y = this.rig.eye;
		this.camera.rotation.x = this.rig.pitch;
		this.trolley.visible = this.rig.trolley;
		this.fitRig();
		this.settleTrolley();
		this.pose = Object.assign( {}, this.poseTarget );
		this.placeTrolley();
		this.request();
		return Object.assign( {}, this.rig );
	}

	/** Keep a camera that rides behind the shopper inside the walls (it closes in near a wall). */
	fitRig() {
		const back = this.rig ? this.rig.back : 0;
		let t = back;
		if ( back > 0 ) {
			const L = this.L;
			const yaw = this.body.rotation.y;
			const bx = Math.sin( yaw );
			const bz = Math.cos( yaw );
			const p = this.body.position;
			const room = ( v, d, lo, hi ) => ( d > 0 ? ( hi - v ) / d : d < 0 ? ( lo - v ) / d : Infinity );
			t = Math.max( 0, Math.min( back, room( p.x, bx, L.xMin + 0.15, L.xMax - 0.15 ), room( p.z, bz, -L.dBack + 0.15, -0.15 ) ) );
		}
		this.camera.position.z = 0.05 + t;
	}

	stats() {
		return {
			frames: this.frames || 0,
			loaded: Object.keys( this.loaded ).filter( ( k ) => 'ready' === this.loaded[ k ] ).map( Number ),
			position: { x: +this.body.position.x.toFixed( 2 ), d: +( -this.body.position.z ).toFixed( 2 ), yaw: +this.body.rotation.y.toFixed( 2 ) },
			place: this.place,
			auto: !! this.auto,
			running: !! this.raf,
			trolleyItems: this.trolley.userData.items.children.length
		};
	}

	destroy() {
		this.savePose( true );
		clearTimeout( this.poseTimer );
		window.removeEventListener( 'pagehide', this.onPageHide );
		this.destroyed = true;
		cancelAnimationFrame( this.raf );
		this.destroyers.splice( 0 ).forEach( ( fn ) => {
			try {
				fn();
			} catch ( error ) {
				console.warn( 'Aisleza: an add-on clean-up failed.', error ); // eslint-disable-line no-console
			}
		} );
		document.removeEventListener( 'keydown', this.onDocKey );
		document.removeEventListener( 'keyup', this.onDocKey );
		window.removeEventListener( 'blur', this.onWindowBlur );
		document.removeEventListener( 'visibilitychange', this.onVisibility );
		this.resizer.disconnect();
		Object.keys( this.shelves.aisles ).forEach( ( i ) => this.shelves.release( i ) );
		Object.keys( this.shelves.displays ).forEach( ( k ) => this.shelves.releaseDisplay( k ) );
		this.envMap.dispose();
		this.renderer.dispose();
		this.trolleyEnv.dispose();
		this.trolleyRenderer.dispose();
		this.root.remove();
	}
}

const created = [];

window.AislezaWorld = {
	supported,
	create: ( container, opts ) => {
		const world = new World( container, opts );
		created.forEach( ( fn ) => {
			try {
				fn( world );
			} catch ( error ) {
				console.warn( 'Aisleza: an add-on failed on a new store.', error ); // eslint-disable-line no-console
			}
		} );
		// A remembered spot: the look up or down too, after add-ons set their camera views.
		if ( Number.isFinite( world.restoredPitch ) ) {
			world.camera.rotation.x = world.restoredPitch;
			world.request();
		}
		return world;
	},
	/** An add-on's function, called with every store the page opens (and each rebuild). */
	onCreate: ( fn ) => {
		if ( typeof fn === 'function' ) {
			created.push( fn );
		}
	},
	registerStyle,
	registerFixture,
	registerProductModels,
	helpers: HELPERS
};

/*
 * Add-ons usually load before this bundle (it loads when the shopper enters the store), so
 * they queue a setup function:
 *   ( window.aislezaWorldQueue = window.aislezaWorldQueue || [] ).push( ( world ) => world.registerStyle( … ) );
 * Queued functions run now, later pushes run at once; one failing add-on never stops the store.
 */
( function () {
	const run = ( fn ) => {
		try {
			if ( typeof fn === 'function' ) {
				fn( window.AislezaWorld );
			}
		} catch ( error ) {
			console.warn( 'Aisleza: an add-on setup failed.', error ); // eslint-disable-line no-console
		}
	};
	const queued = Array.isArray( window.aislezaWorldQueue ) ? window.aislezaWorldQueue : [];
	window.aislezaWorldQueue = { push: ( ...fns ) => fns.forEach( run ) };
	queued.forEach( run );
}() );
