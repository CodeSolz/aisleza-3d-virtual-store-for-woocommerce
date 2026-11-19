/**
 * Aisleza — the store app (3D walk-in view, shelf wall and list).
 *
 * Products and the cart come from the WooCommerce Store API; try-on, when an integration such
 * as WearGraph is ready, is that plugin's own fitting room through AislezaBridge. All text is inserted with textContent. Nothing about the cart is
 * kept in the browser: sessionStorage holds only UI preferences (entered, aisle, list view) and
 * where the shopper left the trolley in the 3D store (restored after a refresh).
 */
( function () {
	'use strict';

	var cfg = window.aislezaConfig;
	var Core = window.AislezaCore;
	var BridgeLib = window.AislezaBridge; // Present only when a try-on integration is ready.
	var roots = document.querySelectorAll( '.aisleza-root' );
	var mount = roots[ 0 ];
	if ( ! cfg || ! Core || ! mount || mount.getAttribute( 'data-ready' ) ) {
		return;
	}
	mount.setAttribute( 'data-ready', '1' );
	// One store per page: any further copy of the shortcode points to the first one.
	Array.prototype.slice.call( roots, 1 ).forEach( function ( extra ) {
		extra.classList.add( 'is-ready', 'aisleza--duplicate' );
		extra.textContent = cfg.i18n.duplicate;
	} );

	var t = cfg.i18n;
	var sections = cfg.sections || [];
	var motion = window.matchMedia ? window.matchMedia( '(prefers-reduced-motion: reduce)' ) : { matches: false };
	var SEARCH_DELAY = 300;
	var CACHE_LIMIT = 40;

	/* ------------------------------------------------------------------ */
	/* Small helpers                                                        */
	/* ------------------------------------------------------------------ */

	function el( tag, attrs, children ) {
		var node = document.createElement( tag );
		Object.keys( attrs || {} ).forEach( function ( key ) {
			var value = attrs[ key ];
			if ( value === false || value === null || value === undefined ) {
				return;
			}
			if ( key === 'className' ) {
				node.className = value;
			} else if ( key === 'text' ) {
				node.textContent = value;
			} else if ( key.indexOf( 'on' ) === 0 && typeof value === 'function' ) {
				node.addEventListener( key.slice( 2 ), value );
			} else {
				node.setAttribute( key, value === true ? '' : value );
			}
		} );
		( children || [] ).forEach( function ( child ) {
			if ( child ) {
				node.appendChild( typeof child === 'string' ? document.createTextNode( child ) : child );
			}
		} );
		return node;
	}

	function fmt( text ) {
		var args = Array.prototype.slice.call( arguments, 1 );
		var i = 0;
		return String( text ).replace( /%%|%(\d\$)?[sd]/g, function ( match, pos ) {
			if ( '%%' === match ) {
				return '%'; // A literal percent sign, as in printf.
			}
			var value = pos ? args[ parseInt( pos, 10 ) - 1 ] : args[ i++ ];
			return value === undefined ? '' : String( value );
		} );
	}

	/** Plain text from Store API HTML (names and descriptions may carry entities or tags). */
	var parser = window.DOMParser ? new window.DOMParser() : null;
	function plain( html ) {
		if ( ! html ) {
			return '';
		}
		if ( ! parser ) {
			return String( html ).replace( /<[^>]*>/g, '' );
		}
		return ( parser.parseFromString( String( html ), 'text/html' ).body.textContent || '' ).replace( /\s+/g, ' ' ).trim();
	}

	function reduced() {
		return !! motion.matches;
	}

	function after( ms, fn ) {
		return window.setTimeout( fn, reduced() ? 0 : ms );
	}

	/** Readable text colour (ink or white) on a #rrggbb background. */
	function inkOn( hex ) {
		var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec( hex || '' );
		if ( ! m ) {
			return '#1b2440';
		}
		var lum = [ m[ 1 ], m[ 2 ], m[ 3 ] ].map( function ( h ) {
			var c = parseInt( h, 16 ) / 255;
			return c <= 0.03928 ? c / 12.92 : Math.pow( ( c + 0.055 ) / 1.055, 2.4 );
		} );
		var l = 0.2126 * lum[ 0 ] + 0.7152 * lum[ 1 ] + 0.0722 * lum[ 2 ];
		return l > 0.36 ? '#1b2440' : '#ffffff';
	}

	var prefs = {
		key: 'aisleza:ui',
		read: function () {
			try {
				return JSON.parse( window.sessionStorage.getItem( this.key ) ) || {};
			} catch ( e ) {
				return {};
			}
		},
		set: function ( name, value ) {
			try {
				var p = this.read();
				p[ name ] = value;
				window.sessionStorage.setItem( this.key, JSON.stringify( p ) );
			} catch ( e ) {}
		}
	};

	function getJSON( url, signal ) {
		return window.fetch( url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: signal } ).then( function ( res ) {
			return res.json().catch( function () {
				return null;
			} ).then( function ( json ) {
				if ( ! res.ok || ! json ) {
					var err = new Error( ( json && json.message ) || t.network );
					err.status = res.status;
					throw err;
				}
				return {
					json: json,
					total: parseInt( res.headers.get( 'X-WP-Total' ), 10 ) || 0,
					pages: parseInt( res.headers.get( 'X-WP-TotalPages' ), 10 ) || 1
				};
			} );
		} );
	}

	function storeUrl( path, params ) {
		return Core.restUrl( cfg.storeApi, path, params );
	}

	function apiUrl( path, params ) {
		return Core.restUrl( cfg.api, path, params );
	}

	/* ------------------------------------------------------------------ */
	/* Artwork (bundled, no external assets)                                */
	/* ------------------------------------------------------------------ */

	var SVG_NS = 'http://www.w3.org/2000/svg';

	function svg( viewBox, className, parts ) {
		var node = document.createElementNS( SVG_NS, 'svg' );
		node.setAttribute( 'viewBox', viewBox );
		node.setAttribute( 'class', className );
		node.setAttribute( 'aria-hidden', 'true' );
		node.setAttribute( 'focusable', 'false' );
		parts.forEach( function ( p ) {
			var child = document.createElementNS( SVG_NS, p[ 0 ] );
			Object.keys( p[ 1 ] ).forEach( function ( k ) {
				child.setAttribute( k, p[ 1 ][ k ] );
			} );
			node.appendChild( child );
		} );
		return node;
	}

	/** Trolley: a back layer (basket fill), the items, then a front layer (mesh, frame, wheels). */
	function trolleyArt() {
		var wrap = el( 'span', { className: 'aisleza-cart-art' } );
		wrap.appendChild( svg( '0 0 120 100', 'aisleza-cart-art__back', [
			[ 'path', { d: 'M27 26 L109 26 L97 64 L37 64 Z', 'class': 'aisleza-cart-art__fill' } ]
		] ) );
		wrap.appendChild( el( 'span', { className: 'aisleza-cart-art__items' } ) );
		wrap.appendChild( svg( '0 0 120 100', 'aisleza-cart-art__front', [
			[ 'path', { d: 'M4 12 H18 L35 66 H98', 'class': 'aisleza-cart-art__frame' } ],
			[ 'path', { d: 'M27 26 H109 L97 64 H37', 'class': 'aisleza-cart-art__frame' } ],
			[ 'path', { d: 'M48 26 L52 64 M68 26 L68 64 M88 26 L84 64 M31 39 H105 M34 51 H101', 'class': 'aisleza-cart-art__mesh' } ],
			[ 'path', { d: 'M35 66 L40 76 H96', 'class': 'aisleza-cart-art__frame' } ],
			[ 'circle', { cx: '46', cy: '86', r: '8', 'class': 'aisleza-cart-art__wheel' } ],
			[ 'circle', { cx: '90', cy: '86', r: '8', 'class': 'aisleza-cart-art__wheel' } ]
		] ) );
		return wrap;
	}

	/* ------------------------------------------------------------------ */
	/* State                                                                */
	/* ------------------------------------------------------------------ */

	var saved = prefs.read();
	var S = {
		view: 'entrance',
		place: { type: 'section', index: Math.min( Math.max( parseInt( saved.section, 10 ) || 0, 0 ), Math.max( sections.length - 1, 0 ) ) },
		lastSection: 0,
		filter: 0,
		page: 1,
		cache: {},
		cacheOrder: [],
		pending: {},
		aisleProducts: {},
		featured: [], // Products on add-on displays outside the aisles (registerFixture).
		world: null,
		products: {},
		eligible: {},
		shelfReq: null,
		cart: null,
		cartFailed: false,
		lastSync: 0,
		list: !! saved.list
	};
	S.lastSection = S.place.index;

	var ui = {};

	/* ------------------------------------------------------------------ */
	/* Live announcements                                                   */
	/* ------------------------------------------------------------------ */

	function announce( text, assertive ) {
		var region = assertive ? ui.alert : ui.status;
		region.textContent = '';
		window.setTimeout( function () {
			region.textContent = text;
		}, 30 );
	}

	/* ------------------------------------------------------------------ */
	/* Dialogs                                                              */
	/* ------------------------------------------------------------------ */

	var openDialog = null;

	function makeDialog( name, labelId ) {
		var dialog = el( 'div', { className: 'aisleza-dialog aisleza-dialog--' + name, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelId, hidden: true } );
		var backdrop = el( 'div', { className: 'aisleza-dialog__backdrop', onclick: function () {
			closeDialog();
		} } );
		var panel = el( 'div', { className: 'aisleza-dialog__panel', tabindex: '-1' } );
		var close = el( 'button', { type: 'button', className: 'aisleza-dialog__close', 'aria-label': t.close, onclick: function () {
			closeDialog();
		} }, [ '×' ] );
		var body = el( 'div', { className: 'aisleza-dialog__body' } );
		panel.appendChild( close );
		panel.appendChild( body );
		dialog.appendChild( backdrop );
		dialog.appendChild( panel );
		dialog.addEventListener( 'keydown', trapKeys );
		return { node: dialog, panel: panel, body: body, trigger: null, onClose: null };
	}

	function focusables( container ) {
		return Array.prototype.filter.call(
			container.querySelectorAll( 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])' ),
			function ( n ) {
				return ! n.disabled && n.offsetParent !== null;
			}
		);
	}

	function trapKeys( e ) {
		if ( e.key === 'Escape' ) {
			e.preventDefault();
			e.stopPropagation();
			closeDialog();
			return;
		}
		if ( e.key !== 'Tab' || ! openDialog ) {
			return;
		}
		var nodes = focusables( openDialog.panel );
		if ( ! nodes.length ) {
			e.preventDefault();
			return;
		}
		var first = nodes[ 0 ];
		var last = nodes[ nodes.length - 1 ];
		if ( e.shiftKey && ( document.activeElement === first || document.activeElement === openDialog.panel ) ) {
			e.preventDefault();
			last.focus();
		} else if ( ! e.shiftKey && document.activeElement === last ) {
			e.preventDefault();
			first.focus();
		}
	}

	// Escape closes the open store dialog even when focus slipped to <body>, but never while
	// WearGraph's fitting room is on top (it handles its own Escape).
	document.addEventListener( 'keydown', function ( e ) {
		if ( e.key !== 'Escape' || ! openDialog || e.defaultPrevented ) {
			return;
		}
		var fitting = document.querySelector( '.wgfr' );
		if ( fitting && ! fitting.hidden ) {
			return;
		}
		e.preventDefault();
		closeDialog();
	} );

	function showDialog( dialog, trigger, focusTarget ) {
		if ( openDialog && openDialog !== dialog ) {
			closeDialog( true );
		}
		dialog.trigger = trigger || document.activeElement;
		dialog.node.hidden = false;
		openDialog = dialog;
		ui.store.inert = true;
		ui.store.setAttribute( 'aria-hidden', 'true' );
		mount.classList.add( 'has-dialog' );
		window.requestAnimationFrame( function () {
			dialog.node.classList.add( 'is-open' );
		} );
		( focusTarget || focusables( dialog.panel )[ 1 ] || dialog.panel ).focus( { preventScroll: true } );
	}

	function closeDialog( keepBackground ) {
		var dialog = openDialog;
		if ( ! dialog ) {
			return;
		}
		openDialog = null;
		dialog.node.classList.remove( 'is-open' );
		dialog.node.hidden = true;
		if ( ! keepBackground ) {
			ui.store.inert = false;
			ui.store.removeAttribute( 'aria-hidden' );
			mount.classList.remove( 'has-dialog' );
		}
		if ( dialog.onClose ) {
			dialog.onClose();
		}
		var back = dialog.trigger;
		if ( ! keepBackground && back && back.focus && document.body.contains( back ) ) {
			back.focus( { preventScroll: true } );
		}
	}

	/* ------------------------------------------------------------------ */
	/* Layout                                                               */
	/* ------------------------------------------------------------------ */

	function build() {
		mount.textContent = '';
		mount.classList.add( 'is-ready' );
		mount.style.setProperty( '--aisleza-accent-ink', inkOn( cfg.accent ) );
		mount.classList.toggle( 'aisleza--list', S.list );

		ui.status = el( 'div', { className: 'aisleza-sr', role: 'status', 'aria-live': 'polite' } );
		ui.alert = el( 'div', { className: 'aisleza-sr', role: 'alert', 'aria-live': 'assertive' } );

		buildEntrance();
		buildStore();

		ui.product = makeDialog( 'product', 'aisleza-product-title' );
		ui.trolley = makeDialog( 'trolley', 'aisleza-trolley-title' );
		ui.map = makeDialog( 'map', 'aisleza-map-title' );

		[ ui.entrance, ui.store, ui.product.node, ui.trolley.node, ui.map.node, ui.status, ui.alert ].forEach( function ( n ) {
			mount.appendChild( n );
		} );
	}

	function buildEntrance() {
		var name = cfg.storeName;
		ui.entrance = el( 'section', { className: 'aisleza-entrance', 'aria-labelledby': 'aisleza-entrance-title' } );
		var facade = el( 'div', { className: 'aisleza-facade' } );
		var logo = Core.logoSource( cfg.logo );
		facade.appendChild( el( 'div', { className: 'aisleza-facade__sign' + ( logo ? ' has-logo' : '' ) }, [
			logo ? el( 'img', { className: 'aisleza-facade__logo', src: logo.url, alt: '', width: logo.width, height: logo.height, decoding: 'async' } ) : null,
			el( 'h2', { id: 'aisleza-entrance-title', className: 'aisleza-facade__name', text: name } )
		] ) );
		facade.appendChild( el( 'div', { className: 'aisleza-awning', 'aria-hidden': 'true' } ) );

		var front = el( 'div', { className: 'aisleza-facade__front' } );
		ui.windows = [ el( 'div', { className: 'aisleza-window', 'aria-hidden': 'true' } ), el( 'div', { className: 'aisleza-window', 'aria-hidden': 'true' } ) ];
		var doors = el( 'div', { className: 'aisleza-doors', 'aria-hidden': 'true' }, [
			el( 'span', { className: 'aisleza-doors__inside' } ),
			el( 'span', { className: 'aisleza-door aisleza-door--a' } ),
			el( 'span', { className: 'aisleza-door aisleza-door--b' } )
		] );
		front.appendChild( ui.windows[ 0 ] );
		front.appendChild( doors );
		front.appendChild( ui.windows[ 1 ] );
		facade.appendChild( front );
		facade.appendChild( el( 'div', { className: 'aisleza-pavement', 'aria-hidden': 'true' } ) );
		ui.entrance.appendChild( facade );

		var welcome = el( 'div', { className: 'aisleza-welcome' } );
		welcome.appendChild( el( 'p', { className: 'aisleza-welcome__lead', text: t.entranceLead } ) );
		ui.enterBtn = el( 'button', { type: 'button', className: 'aisleza-btn aisleza-btn--primary aisleza-btn--big', onclick: enterStore, text: t.enter } );
		welcome.appendChild( ui.enterBtn );
		welcome.appendChild( el( 'p', { className: 'aisleza-welcome__alt' }, [
			el( 'a', { href: cfg.shopUrl, text: t.regularShop } )
		] ) );
		ui.welcome = welcome;

		var bay = el( 'div', { className: 'aisleza-bay', hidden: true } );
		var parked = el( 'span', { className: 'aisleza-bay__trolley' }, [ trolleyArt() ] );
		ui.bayText = el( 'p', { className: 'aisleza-bay__text', id: 'aisleza-bay-text', text: t.takeTrolleyLead } );
		ui.takeBtn = el( 'button', { type: 'button', className: 'aisleza-btn aisleza-btn--primary aisleza-btn--big', 'aria-describedby': 'aisleza-bay-text', onclick: takeTrolley, text: t.takeTrolley } );
		bay.appendChild( parked );
		bay.appendChild( ui.bayText );
		bay.appendChild( ui.takeBtn );
		ui.bay = bay;

		ui.entrance.appendChild( welcome );
		ui.entrance.appendChild( bay );
		ui.doors = doors;
	}

	function buildStore() {
		ui.store = el( 'div', { className: 'aisleza-store', hidden: true } );

		if ( cfg.preview ) {
			ui.store.appendChild( el( 'p', { className: 'aisleza-preview-note', text: t.previewNote } ) );
		}

		/*
		 * Floating tools on the left (aisles, search, map, list view, size, the regular shop), and a
		 * drawer with the store name, the search and every aisle. The scene gets the full height.
		 * An add-on with its own way to find products (a shopping assistant) hides the search
		 * (config `search: false`).
		 */
		var withSearch = false !== cfg.search;
		ui.rail = el( 'div', { className: 'aisleza-rail', role: 'toolbar', 'aria-label': t.storeTools, 'aria-orientation': 'vertical' } );
		ui.menuBtn = railButton( 'menu', t.aislesMenu, function () {
			openDrawer( false );
		} );
		ui.menuBtn.setAttribute( 'aria-controls', 'aisleza-drawer' );
		ui.menuBtn.setAttribute( 'aria-expanded', 'false' );
		ui.rail.appendChild( ui.menuBtn );
		if ( withSearch ) {
			ui.searchBtn = railButton( 'search', t.searchLabel, function () {
				openDrawer( true );
			} );
			ui.rail.appendChild( ui.searchBtn );
		}
		ui.mapBtn = railButton( 'map', t.storeMap, function () {
			openMap( ui.mapBtn );
		} );
		ui.mapBtn.setAttribute( 'aria-haspopup', 'dialog' );
		ui.rail.appendChild( ui.mapBtn );
		ui.listBtn = railButton( 'list', t.listView, toggleList );
		ui.listBtn.setAttribute( 'aria-pressed', S.list ? 'true' : 'false' );
		ui.rail.appendChild( ui.listBtn );
		buildSizeButtons( ui.rail );
		var shop = el( 'a', { className: 'aisleza-rail__btn aisleza-rail__btn--shop', href: cfg.shopUrl }, [ el( 'span', { className: 'aisleza-rail__label', text: t.regularShop } ) ] );
		ui.rail.appendChild( shop );
		ui.store.appendChild( ui.rail );

		ui.drawer = el( 'aside', { className: 'aisleza-drawer', id: 'aisleza-drawer', 'aria-labelledby': 'aisleza-drawer-title', hidden: true } );
		var drawerHead = el( 'div', { className: 'aisleza-drawer__head' } );
		drawerHead.appendChild( el( 'h2', { className: 'aisleza-drawer__name', id: 'aisleza-drawer-title', text: cfg.storeName } ) );
		ui.drawerClose = el( 'button', { type: 'button', className: 'aisleza-drawer__close', 'aria-label': t.close, title: t.close, onclick: function () {
			closeDrawer( true );
		} } );
		drawerHead.appendChild( ui.drawerClose );
		ui.drawer.appendChild( drawerHead );

		var searchForm = el( 'form', { className: 'aisleza-search', role: 'search', hidden: ! withSearch, onsubmit: function ( e ) {
			e.preventDefault();
			runSearch( ui.search.value, true );
			closeDrawer( false );
		} } );
		searchForm.appendChild( el( 'label', { className: 'aisleza-sr', 'for': 'aisleza-search', text: t.searchLabel } ) );
		ui.search = el( 'input', { type: 'search', id: 'aisleza-search', className: 'aisleza-search__input', placeholder: t.searchPlaceholder, autocomplete: 'off', maxlength: '100' } );
		ui.search.addEventListener( 'input', function () {
			window.clearTimeout( ui.searchTimer );
			ui.searchTimer = window.setTimeout( function () {
				runSearch( ui.search.value, false );
			}, SEARCH_DELAY );
		} );
		searchForm.appendChild( ui.search );
		ui.drawer.appendChild( searchForm );

		ui.aisles = el( 'nav', { className: 'aisleza-aisles', 'aria-labelledby': 'aisleza-aisles-title' } );
		ui.aisles.appendChild( el( 'p', { className: 'aisleza-aisles__title', id: 'aisleza-aisles-title', text: t.aislesMenu } ) );
		ui.aisleList = el( 'ul', { className: 'aisleza-aisles__list' } );
		ui.aisles.appendChild( ui.aisleList );
		ui.drawer.appendChild( ui.aisles );
		ui.drawerShade = el( 'div', { className: 'aisleza-drawer-shade', hidden: true, onclick: function () {
			closeDrawer( true );
		} } );
		ui.store.appendChild( ui.drawerShade );
		ui.store.appendChild( ui.drawer );
		ui.drawer.addEventListener( 'keydown', function ( e ) {
			if ( 'Escape' === e.key ) {
				e.preventDefault();
				e.stopPropagation();
				closeDrawer( true );
			}
		} );

		/* Scene */
		var scene = el( 'section', { className: 'aisleza-scene', 'aria-labelledby': 'aisleza-sign-title' } );
		var room = el( 'div', { className: 'aisleza-room', 'aria-hidden': 'true' }, [
			el( 'span', { className: 'aisleza-room__ceiling' } ),
			el( 'span', { className: 'aisleza-room__wall aisleza-room__wall--start' } ),
			el( 'span', { className: 'aisleza-room__wall aisleza-room__wall--end' } ),
			el( 'span', { className: 'aisleza-room__floor' } )
		] );
		scene.appendChild( room );
		ui.stage = el( 'div', { className: 'aisleza-stage' } );
		ui.signPlate = el( 'div', { className: 'aisleza-sign' } );
		ui.signImg = el( 'img', { className: 'aisleza-sign__img', alt: '', hidden: true } );
		ui.signTitle = el( 'h2', { id: 'aisleza-sign-title', className: 'aisleza-sign__title', tabindex: '-1' } );
		ui.signPlate.appendChild( el( 'span', { className: 'aisleza-sign__plate' }, [ ui.signImg, ui.signTitle ] ) );
		ui.stage.appendChild( ui.signPlate );
		ui.filters = el( 'div', { className: 'aisleza-filters', role: 'group', 'aria-label': t.filters, hidden: true } );
		ui.stage.appendChild( ui.filters );
		ui.shelving = el( 'div', { className: 'aisleza-shelving' } );
		ui.stage.appendChild( ui.shelving );
		ui.shelfNav = el( 'div', { className: 'aisleza-shelfnav', hidden: true } );
		ui.prevBtn = el( 'button', { type: 'button', className: 'aisleza-btn aisleza-btn--ghost', onclick: function () {
			turnShelf( -1 );
		}, text: t.prevShelf } );
		ui.nextBtn = el( 'button', { type: 'button', className: 'aisleza-btn aisleza-btn--ghost', onclick: function () {
			turnShelf( 1 );
		}, text: t.nextShelf } );
		ui.shelfLabel = el( 'span', { className: 'aisleza-shelfnav__label' } );
		ui.shelfNav.appendChild( ui.prevBtn );
		ui.shelfNav.appendChild( ui.shelfLabel );
		ui.shelfNav.appendChild( ui.nextBtn );
		ui.stage.appendChild( ui.shelfNav );
		scene.appendChild( ui.stage );

		ui.sceneTrolley = el( 'button', { type: 'button', className: 'aisleza-trolley', 'aria-haspopup': 'dialog', onclick: function () {
			openTrolley( ui.sceneTrolley );
		} }, [ trolleyArt(), el( 'span', { className: 'aisleza-trolley__count', 'aria-hidden': 'true', text: '0' } ) ] );
		scene.appendChild( ui.sceneTrolley );
		ui.scene = scene;
		ui.store.appendChild( scene );

		/* Summary bar */
		var summary = el( 'div', { className: 'aisleza-summary', role: 'region', 'aria-label': t.trolleySummary } );
		ui.barTrolley = el( 'button', { type: 'button', className: 'aisleza-summary__trolley', 'aria-haspopup': 'dialog', onclick: function () {
			openTrolley( ui.barTrolley );
		} }, [ trolleyArt(), el( 'span', { className: 'aisleza-trolley__count', 'aria-hidden': 'true', text: '0' } ) ] );
		ui.summaryText = el( 'p', { className: 'aisleza-summary__text' } );
		ui.checkoutBtn = el( 'a', { className: 'aisleza-btn aisleza-btn--primary aisleza-summary__checkout', href: cfg.checkoutUrl, text: t.checkout } );
		ui.checkoutBtn.addEventListener( 'click', guardCheckout );
		summary.appendChild( ui.barTrolley );
		summary.appendChild( ui.summaryText );
		summary.appendChild( ui.checkoutBtn );
		ui.store.appendChild( summary );

		renderAisles();
	}

	/* ------------------------------------------------------------------ */
	/* Entrance                                                             */
	/* ------------------------------------------------------------------ */

	function fillWindows( products ) {
		var withImages = products.filter( function ( p ) {
			return p.images && p.images[ 0 ];
		} );
		ui.windows.forEach( function ( win, w ) {
			win.textContent = '';
			withImages.slice( w * 2, w * 2 + 2 ).forEach( function ( p ) {
				win.appendChild( el( 'img', { src: p.images[ 0 ].thumbnail || p.images[ 0 ].src, alt: '', loading: 'lazy', decoding: 'async' } ) );
			} );
		} );
	}

	/**
	 * Shopper events for add-ons (analytics, for example): a DOM event 'aisleza:track' on the store's
	 * root (it bubbles) with detail { type, ... }: 'enter' (walked in), 'aisle' { index, label },
	 * 'counter' (at the checkout counter), 'product' { id, name } (opened), 'add' { id, quantity, name } (in the
	 * trolley), 'checkout' (went to pay). Nothing leaves the page here; a listener decides.
	 */
	function track( type, data ) {
		try {
			var detail = { type: type };
			Object.keys( data || {} ).forEach( function ( k ) {
				detail[ k ] = data[ k ];
			} );
			mount.dispatchEvent( new window.CustomEvent( 'aisleza:track', { bubbles: true, detail: detail } ) );
		} catch ( e ) {
			// An add-on's listener never breaks the store.
		}
	}

	function enterStore() {
		track( 'enter' );
		mount.classList.add( 'is-entering' );
		ui.doors.classList.add( 'is-open' );
		ui.welcome.hidden = true;
		ui.bay.hidden = false;
		var units = Core.cartUnits( S.cart );
		ui.bayText.textContent = units ? fmt( t.welcomeBack, itemsLabel( units ) ) : t.takeTrolleyLead;
		ui.takeBtn.textContent = units ? t.takeYourTrolley : t.takeTrolley;
		ui.takeBtn.focus();
	}

	function takeTrolley() {
		prefs.set( 'entered', true );
		showStore( true );
	}

	/* ------------------------------------------------------------------ */
	/* Store size: in the page, filling the window, or full screen         */
	/* ------------------------------------------------------------------ */

	var fullscreenApi = ( function () {
		var d = document;
		if ( d.fullscreenEnabled && mount.requestFullscreen ) {
			return {
				on: function () {
					return d.fullscreenElement === mount;
				},
				enter: function () {
					return mount.requestFullscreen();
				},
				exit: function () {
					return d.exitFullscreen();
				},
				change: 'fullscreenchange'
			};
		}
		if ( d.webkitFullscreenEnabled && mount.webkitRequestFullscreen ) {
			return {
				on: function () {
					return d.webkitFullscreenElement === mount;
				},
				enter: function () {
					return mount.webkitRequestFullscreen();
				},
				exit: function () {
					return d.webkitExitFullscreen();
				},
				change: 'webkitfullscreenchange'
			};
		}
		return null; // iPhone Safari and others: no full screen for page elements.
	}() );

	// The Full window layout already fills the window; inside a theme the store can grow to it.
	var canFill = mount.classList.contains( 'aisleza--theme' );

	/**
	 * A tool on the floating rail: an icon, with its name shown beside it on hover and focus. After
	 * a mouse click on a tool that only changes the view (size, list view), the keyboard goes back
	 * to the store, so the walking keys work at once; keyboard users keep their place on the rail.
	 */
	function railButton( name, label, onclick ) {
		var back = 'fill' === name || 'full' === name || 'list' === name;
		return el( 'button', { type: 'button', className: 'aisleza-rail__btn aisleza-rail__btn--' + name, onclick: function ( e ) {
			onclick( e );
			if ( back && e.detail > 0 && S.world && ! S.list ) {
				S.world.focus();
			}
		} }, [ el( 'span', { className: 'aisleza-rail__label', text: label } ) ] );
	}

	function sizeButton( name, onclick ) {
		var b = railButton( name, '', onclick );
		b.classList.add( 'aisleza-size__' + name );
		b.setAttribute( 'aria-pressed', 'false' );
		return b;
	}

	/** Open the drawer (aisles and search); focus the search box or the current aisle. */
	function openDrawer( toSearch ) {
		ui.drawer.hidden = false;
		ui.drawerShade.hidden = false;
		ui.menuBtn.setAttribute( 'aria-expanded', 'true' );
		mount.classList.add( 'is-drawer' );
		var current = ui.aisleList.querySelector( '[aria-current="true"]' ) || ui.aisleList.querySelector( 'button' );
		var target = toSearch && ! ui.search.closest( 'form' ).hidden ? ui.search : current;
		if ( target ) {
			target.focus( { preventScroll: true } );
		}
	}

	/** Close the drawer; give focus back to the menu button when asked. */
	function closeDrawer( refocus ) {
		if ( ui.drawer.hidden ) {
			return;
		}
		ui.drawer.hidden = true;
		ui.drawerShade.hidden = true;
		ui.menuBtn.setAttribute( 'aria-expanded', 'false' );
		mount.classList.remove( 'is-drawer' );
		if ( refocus ) {
			ui.menuBtn.focus( { preventScroll: true } );
		} else if ( S.world && ! S.list ) {
			S.world.focus();
		}
	}

	function buildSizeButtons( tools ) {
		if ( canFill ) {
			ui.fillBtn = sizeButton( 'fill', function () {
				setFill( ! mount.classList.contains( 'is-fill' ) );
			} );
			tools.appendChild( ui.fillBtn );
		}
		if ( fullscreenApi ) {
			ui.fullBtn = sizeButton( 'full', function () {
				var result = fullscreenApi.on() ? fullscreenApi.exit() : fullscreenApi.enter();
				if ( result && result.catch ) {
					result.catch( function () {} ); // Refused (no permission, an iframe): nothing changes.
				}
			} );
			tools.appendChild( ui.fullBtn );
			document.addEventListener( fullscreenApi.change, syncSize );
		}
		syncSize();
	}

	/** Grow the store over the whole browser window (no browser full screen), or back into the page. */
	function setFill( on ) {
		if ( ! canFill ) {
			return;
		}
		mount.classList.toggle( 'is-fill', on );
		document.documentElement.classList.toggle( 'aisleza-filled', on );
		syncSize();
	}

	function syncSize() {
		var label = function ( btn, on, yes, no ) {
			if ( btn ) {
				btn.setAttribute( 'aria-pressed', on ? 'true' : 'false' );
				btn.setAttribute( 'aria-label', on ? no : yes );
				btn.title = on ? no : yes;
			}
		};
		var full = !! ( fullscreenApi && fullscreenApi.on() );
		mount.classList.toggle( 'is-fullscreen', full );
		label( ui.fillBtn, mount.classList.contains( 'is-fill' ), t.fillWindow, t.exitFillWindow );
		label( ui.fullBtn, full, t.fullScreen, t.exitFullScreen );
		[ [ ui.fillBtn, mount.classList.contains( 'is-fill' ), t.fillWindow, t.exitFillWindow ], [ ui.fullBtn, full, t.fullScreen, t.exitFullScreen ] ].forEach( function ( x ) {
			if ( x[ 0 ] ) {
				x[ 0 ].querySelector( '.aisleza-rail__label' ).textContent = x[ 1 ] ? x[ 3 ] : x[ 2 ];
			}
		} );
		if ( ui.fillBtn ) {
			ui.fillBtn.hidden = full; // Full screen already covers everything.
		}
	}

	/** Leave full screen (the try-on fitting room opens outside the store, where it would be hidden). */
	function leaveFullScreen() {
		if ( fullscreenApi && fullscreenApi.on() ) {
			var result = fullscreenApi.exit();
			if ( result && result.catch ) {
				result.catch( function () {} );
			}
		}
	}

	// Escape gives the page back when the store fills the window (a dialog's Escape comes first).
	document.addEventListener( 'keydown', function ( e ) {
		if ( e.key === 'Escape' && ! e.defaultPrevented && ! openDialog && mount.classList.contains( 'is-fill' ) ) {
			setFill( false );
		}
	} );

	function showStore( arriving ) {
		S.view = 'store';
		if ( 'window' === cfg.openSize && ! cfg.designPreview ) {
			setFill( true );
		}
		ui.entrance.hidden = true;
		ui.store.hidden = false;
		mount.classList.remove( 'is-entering' );
		mount.classList.add( 'is-inside' );
		if ( arriving && ! reduced() ) {
			ui.sceneTrolley.classList.add( 'is-arriving' );
			after( 900, function () {
				ui.sceneTrolley.classList.remove( 'is-arriving' );
			} );
		}
		go( S.place, { initial: true } );
		if ( arriving ) {
			ui.signTitle.focus( { preventScroll: true } );
		}
		if ( 'shelves' !== cfg.view ) {
			loadWorld();
		}
	}

	/* ------------------------------------------------------------------ */
	/* Walk-in 3D store (assets/js/world.js, loaded on entry)              */
	/* ------------------------------------------------------------------ */

	var AISLE_MAX = 48;

	function loadWorld() {
		if ( S.world || S.worldLoading || ! cfg.worldJs ) {
			return;
		}
		S.worldLoading = true;
		var script = document.createElement( 'script' );
		script.src = cfg.worldJs;
		script.async = true;
		script.onload = startWorld;
		script.onerror = function () {
			S.worldLoading = false; // The 2.5D shelves stay in place.
		};
		document.body.appendChild( script );
	}

	function packLabels() {
		return { tryOn: t.tryOnBadge, sale: t.sale, out: t.outOfStock };
	}

	function describe( product ) {
		var price = Core.priceParts( product.prices );
		return {
			name: plain( product.name ),
			price: price.text || t.seeProduct,
			was: price.regular,
			tryon: !! S.eligible[ product.id ],
			sale: price.onSale,
			out: ! product.is_in_stock,
			labels: packLabels()
		};
	}

	/**
	 * What a section shows: its category, or for an add-on's query aisle (aisleza_query_aisles)
	 * its query. Only the keys a query aisle may set are copied.
	 */
	function sectionQuery( section, base, category ) {
		if ( section && section.query ) {
			[ 'orderby', 'order', 'on_sale', 'featured', 'after', 'before' ].forEach( function ( k ) {
				if ( typeof section.query[ k ] === 'string' ) {
					base[ k ] = section.query[ k ];
				}
			} );
		} else {
			base.category = String( category || section.id );
		}
		return base;
	}

	function loadAisle( i ) {
		var query = sectionQuery( sections[ i ], { per_page: AISLE_MAX, page: 1, orderby: cfg.orderby, order: cfg.order, catalog_visibility: 'catalog' } );
		return fetchShelf( query ).then( function ( data ) {
			S.aisleProducts[ i ] = data.products;
			checkTryOn( data.products );
			if ( S.place.type === 'section' && S.place.index === i ) {
				renderWorldList();
			}
			return data.products;
		} );
	}

	/** Products for the add-on displays outside the aisles, in one request. */
	function loadFeatured( ids ) {
		var query = { include: ids.join( ',' ), per_page: Math.min( 100, ids.length ), page: 1, catalog_visibility: 'catalog' };
		return fetchShelf( query ).then( function ( data ) {
			var byId = {};
			data.products.forEach( function ( p ) {
				byId[ p.id ] = p;
			} );
			S.featured = ids.map( function ( id ) {
				return byId[ id ];
			} ).filter( Boolean );
			checkTryOn( S.featured );
			renderWorldList();
			return data.products;
		} );
	}

	/**
	 * Open a product from the 3D store: a stocked one at once; one that isn't loaded yet (an
	 * add-on's link to any product) after fetching it.
	 */
	function showProduct( id ) {
		if ( S.products[ id ] ) {
			openProduct( id, S.world && S.world.canvas );
			return;
		}
		fetchShelf( { include: String( id ), per_page: 1, page: 1 } ).then( function () {
			openProduct( id, S.world && S.world.canvas );
		} ).catch( function () {} );
	}

	function startWorld() {
		if ( ! window.AislezaWorld || ! window.AislezaWorld.supported() ) {
			S.worldLoading = false;
			return;
		}
		ui.worldBox = el( 'div', { className: 'aisleza-worldbox' } );
		ui.worldList = el( 'section', { className: 'aisleza-worldlist', 'aria-labelledby': 'aisleza-worldlist-title' } );
		ui.hudCounter = el( 'div', { className: 'aisleza-hud-counter', role: 'region', 'aria-label': t.checkoutCounter, hidden: true } );
		ui.scene.insertBefore( ui.worldBox, ui.scene.firstChild );
		ui.scene.appendChild( ui.worldList );
		ui.scene.appendChild( ui.hudCounter );
		var max = sections.reduce( function ( m, s ) {
			return Math.max( m, s.count || 0 );
		}, 1 );
		S.worldBooting = true;
		try {
			S.world = window.AislezaWorld.create( ui.worldBox, {
				sections: sections,
				accent: cfg.accent,
				skin: cfg.skin || null,
				storeName: cfg.storeName,
				logo: Core.logoSource( cfg.logo ),
				maxCount: Math.min( AISLE_MAX, max ),
				// Where the shopper left the trolley on this page before a refresh; else the entrance.
				startPose: saved.pose && saved.pose.page === location.pathname ? saved.pose : null,
				onPose: function ( pose ) {
					pose.page = location.pathname;
					prefs.set( 'pose', pose );
				},
				i18n: t,
				packLabels: packLabels(),
				describe: describe,
				loadAisle: loadAisle,
				config: cfg, // Add-on fixtures read their own keys from it.
				announce: function ( text ) {
					announce( text );
				},
				onListChange: function () {
					window.setTimeout( renderWorldList, 0 ); // An add-on changed its list entries (perhaps while the store is being made).
				},
				loadProducts: loadFeatured,
				reducedMotion: reduced,
				blocked: function () {
					return !! openDialog || mount.classList.contains( 'is-fitting' );
				},
				onProduct: showProduct,
				onPlace: onWorldPlace,
				onNothingAhead: function () {
					announce( t.nothingAhead );
				}
			} );
		} catch ( e ) {
			ui.worldBox.remove();
			ui.worldList.remove();
			ui.hudCounter.remove();
			S.world = null;
			S.worldLoading = false;
			return;
		}
		S.worldBooting = false;
		mount.classList.add( 'is-3d' );
		if ( S.cart ) {
			S.world.setCart( S.cart.items );
		}
		window.AislezaStore = { world: S.world }; // For automated checks and debugging only.
		if ( ! S.list && ! openDialog ) {
			S.world.focus();
		}
	}

	/** The shopper walked somewhere: keep the aisle buttons, list and counter card in step. */
	function onWorldPlace( place ) {
		if ( S.place.type === 'search' ) {
			return;
		}
		if ( typeof place === 'number' ) {
			if ( S.tracked !== place ) {
				S.tracked = place;
				track( 'aisle', { index: place, label: sections[ place ] ? String( sections[ place ].label || '' ) : '' } );
			}
			S.place = { type: 'section', index: place };
			S.lastSection = place;
			prefs.set( 'section', place );
		} else if ( 'counter' === place ) {
			if ( S.tracked !== 'counter' ) {
				S.tracked = 'counter';
				track( 'counter' );
			}
			S.place = { type: 'counter' };
		} else {
			S.tracked = null;
			S.place = { type: 'lobby' };
		}
		renderAisles();
		renderWorldList();
		ui.hudCounter.hidden = 'counter' !== place;
		if ( 'counter' === place ) {
			renderCounterHud();
		}
		if ( ! S.worldBooting ) {
			announce( fmt( t.nowIn, S.place.type === 'lobby' ? t.lobby : signLabel() ) );
		}
	}

	/** Keyboard and screen-reader route to the products around the shopper. */
	function renderWorldList() {
		if ( ! ui.worldList ) {
			return;
		}
		ui.worldList.textContent = '';
		var inAisle = S.place.type === 'section';
		var featured = ! inAisle && S.featured && S.featured.length; // Between the aisles: the add-on displays.
		ui.worldList.appendChild( el( 'h2', { id: 'aisleza-worldlist-title', className: 'aisleza-worldlist__title', text: inAisle ? fmt( t.aisleProductsIn, signLabel() ) : ( featured ? t.featuredProducts : t.aisleProducts ) } ) );
		var products = inAisle ? S.aisleProducts[ S.place.index ] : ( featured ? S.featured : null );
		var entries = ! inAisle && S.world && S.world.listEntries ? S.world.listEntries() : []; // Add-ons' (addListEntry).
		if ( ( ! products || ! products.length ) && ! entries.length ) {
			ui.worldList.appendChild( el( 'p', { className: 'aisleza-worldlist__empty', text: t.noAisleProducts } ) );
			return;
		}
		products = products || [];
		var list = el( 'ul', { className: 'aisleza-worldlist__items' } );
		// Between the aisles, the add-ons' entries come first (such as videos to play).
		entries.forEach( function ( entry ) {
			var v = el( 'button', { type: 'button', className: 'aisleza-worldlist__item aisleza-worldlist__item--addon', onclick: function () {
				try {
					entry.onChoose();
				} catch ( e ) {
					// An add-on's entry failed; the list and the store carry on.
				}
			} }, [ entry.label ] );
			list.appendChild( el( 'li', {}, [ v ] ) );
		} );
		products.forEach( function ( product ) {
			var price = Core.priceParts( product.prices );
			var b = el( 'button', { type: 'button', className: 'aisleza-worldlist__item', 'aria-haspopup': 'dialog', onclick: function () {
				openProduct( product.id, b );
			} }, [ plain( product.name ) + ( price.text ? ', ' + price.text : '' ) ] );
			list.appendChild( el( 'li', {}, [ b ] ) );
		} );
		ui.worldList.appendChild( list );
	}

	function renderCounterHud() {
		ui.hudCounter.textContent = '';
		ui.hudCounter.appendChild( counterCard() );
	}

	/* ------------------------------------------------------------------ */
	/* Aisles and travel                                                    */
	/* ------------------------------------------------------------------ */

	function placeKey( place ) {
		return place.type === 'section' ? 's' + place.index : place.type;
	}

	function renderAisles() {
		ui.aisleList.textContent = '';
		sections.forEach( function ( section, i ) {
			var active = S.place.type === 'section' && S.place.index === i;
			var b = el( 'button', { type: 'button', className: 'aisleza-aisle', 'aria-current': active ? 'true' : null, onclick: function () {
				closeDrawer( false );
				go( { type: 'section', index: i } );
			} }, [
				el( 'span', { className: 'aisleza-aisle__dot', 'aria-hidden': 'true' } ),
				el( 'span', { className: 'aisleza-aisle__name', text: section.label } ),
				section.count > 0 ? el( 'span', { className: 'aisleza-aisle__count', 'aria-hidden': 'true', text: String( section.count ) } ) : null
			] );
			b.style.setProperty( '--aisleza-section', section.accent || cfg.accent );
			ui.aisleList.appendChild( el( 'li', {}, [ b ] ) );
		} );
		var counter = el( 'button', { type: 'button', className: 'aisleza-aisle aisleza-aisle--counter', 'aria-current': S.place.type === 'counter' ? 'true' : null, onclick: function () {
			closeDrawer( false );
			go( { type: 'counter' } );
		} }, [ el( 'span', { className: 'aisleza-aisle__dot', 'aria-hidden': 'true' } ), el( 'span', { text: t.checkoutCounter } ) ] );
		ui.aisleList.appendChild( el( 'li', {}, [ counter ] ) );
	}

	/** Travel to an aisle, the search aisle or the checkout counter. Never waits for animation. */
	function go( place, opts ) {
		opts = opts || {};
		if ( S.world && ! S.list && place.type !== 'search' ) {
			// Walk there in the 3D store; onWorldPlace() updates everything on arrival.
			S.place = place;
			if ( place.type === 'section' ) {
				S.lastSection = place.index;
				prefs.set( 'section', place.index );
			}
			if ( ui.search.value && ! opts.fromSearch ) {
				ui.search.value = '';
			}
			mount.classList.remove( 'is-searching' );
			renderAisles();
			if ( ! opts.initial ) {
				if ( place.type === 'counter' ) {
					S.world.walkToCounter();
				} else if ( place.type === 'section' ) {
					S.world.walkToAisle( place.index );
				}
				S.world.focus();
			}
			return;
		}
		if ( S.world ) {
			mount.classList.toggle( 'is-searching', place.type === 'search' );
		}
		var from = S.place;
		var fromIndex = from.type === 'section' ? from.index : ( from.type === 'counter' ? sections.length : -1 );
		var toIndex = place.type === 'section' ? place.index : ( place.type === 'counter' ? sections.length : -1 );
		S.place = place;
		if ( place.type === 'section' ) {
			S.lastSection = place.index;
			prefs.set( 'section', place.index );
		}
		if ( ! opts.keepPage ) {
			S.page = 1;
			S.filter = 0;
		}
		if ( place.type !== 'search' && ui.search.value && ! opts.fromSearch ) {
			ui.search.value = '';
		}
		renderAisles();

		var direction = toIndex >= fromIndex ? 1 : -1;
		mount.style.setProperty( '--aisleza-dir', String( direction ) );
		if ( ! opts.initial && placeKey( from ) !== placeKey( place ) && ! reduced() ) {
			ui.stage.classList.remove( 'is-arriving' );
			void ui.stage.offsetWidth;
			ui.stage.classList.add( 'is-arriving' );
			ui.sceneTrolley.classList.remove( 'is-rolling' );
			void ui.sceneTrolley.offsetWidth;
			ui.sceneTrolley.classList.add( 'is-rolling' );
		}
		mount.classList.toggle( 'is-at-counter', place.type === 'counter' );
		renderStage();
		if ( ! opts.initial && ! opts.quiet ) {
			announce( fmt( t.nowIn, signLabel() ) );
		}
	}

	function signLabel() {
		if ( S.place.type === 'lobby' ) {
			return t.lobby;
		}
		if ( S.place.type === 'counter' ) {
			return t.checkoutCounter;
		}
		if ( S.place.type === 'search' ) {
			return fmt( t.searchResults, S.place.q );
		}
		var section = sections[ S.place.index ];
		return section ? section.label : cfg.storeName;
	}

	function renderStage() {
		if ( S.place.type === 'lobby' ) {
			S.place = { type: 'section', index: S.lastSection }; // The plain view has no lobby.
		}
		var section = S.place.type === 'section' ? sections[ S.place.index ] : null;
		var accent = section && section.accent ? section.accent : cfg.accent;
		ui.stage.style.setProperty( '--aisleza-section', accent );
		ui.stage.style.setProperty( '--aisleza-section-ink', inkOn( accent ) );
		ui.signTitle.textContent = signLabel();
		if ( section && section.image ) {
			ui.signImg.src = section.image;
			ui.signImg.hidden = false;
		} else {
			ui.signImg.hidden = true;
			ui.signImg.removeAttribute( 'src' );
		}
		renderFilters( section );

		if ( S.place.type === 'counter' ) {
			if ( S.shelfReq ) {
				S.shelfReq.abort();
			}
			ui.shelfNav.hidden = true;
			renderCounter();
			return;
		}
		if ( ! section && S.place.type === 'section' ) {
			ui.shelving.classList.remove( 'is-counter' );
			ui.shelfNav.hidden = true;
			ui.shelving.textContent = '';
			ui.shelving.appendChild( notice( t.noSections, [ el( 'a', { className: 'aisleza-btn', href: cfg.shopUrl, text: t.regularShop } ) ] ) );
			return;
		}
		loadShelf();
	}

	function renderFilters( section ) {
		ui.filters.textContent = '';
		if ( ! section || ! section.filters || ! section.filters.length ) {
			ui.filters.hidden = true;
			return;
		}
		ui.filters.hidden = false;
		var all = [ { id: 0, name: t.allInSection } ].concat( section.filters );
		all.forEach( function ( f ) {
			ui.filters.appendChild( el( 'button', { type: 'button', className: 'aisleza-chip', 'aria-pressed': S.filter === f.id ? 'true' : 'false', onclick: function () {
				if ( S.filter === f.id ) {
					return;
				}
				S.filter = f.id;
				S.page = 1;
				renderFilters( section );
				loadShelf();
			}, text: f.name } ) );
		} );
	}

	function notice( text, actions ) {
		var box = el( 'div', { className: 'aisleza-notice' }, [ el( 'p', { text: text } ) ] );
		if ( actions && actions.length ) {
			box.appendChild( el( 'p', { className: 'aisleza-notice__actions' }, actions ) );
		}
		return box;
	}

	/* ------------------------------------------------------------------ */
	/* Shelves (one page of one aisle at a time)                            */
	/* ------------------------------------------------------------------ */

	function shelfQuery( page ) {
		var base = { per_page: cfg.perShelf, page: page, orderby: cfg.orderby, order: cfg.order };
		if ( S.place.type === 'search' ) {
			base.search = S.place.q;
			base.catalog_visibility = 'search';
			base.category = sections.filter( function ( s ) {
				return ! s.query;
			} ).map( function ( s ) {
				return s.id;
			} ).join( ',' );
			base.category_operator = 'in';
		} else {
			base.catalog_visibility = 'catalog';
			sectionQuery( sections[ S.place.index ], base, S.filter );
		}
		return base;
	}

	function cacheKey( query ) {
		return JSON.stringify( query );
	}

	function remember( key, value ) {
		if ( ! S.cache[ key ] ) {
			S.cacheOrder.push( key );
			if ( S.cacheOrder.length > CACHE_LIMIT ) {
				delete S.cache[ S.cacheOrder.shift() ];
			}
		}
		S.cache[ key ] = value;
	}

	function fetchShelf( query, signal ) {
		var key = cacheKey( query );
		if ( S.cache[ key ] ) {
			return Promise.resolve( S.cache[ key ] );
		}
		// Identical requests in flight (window display + first shelf, prefetch + turn) share one.
		// Only unabortable requests are shared, so an aborted shelf never fails another caller.
		if ( S.pending[ key ] ) {
			return S.pending[ key ];
		}
		var request = getJSON( storeUrl( 'products', query ), signal ).then( function ( res ) {
			var data = { products: res.json, pages: Math.max( 1, res.pages ), total: res.total };
			data.products.forEach( function ( p ) {
				S.products[ p.id ] = p;
			} );
			remember( key, data );
			return data;
		} );
		if ( ! signal ) {
			S.pending[ key ] = request;
			request.then( function () {
				delete S.pending[ key ];
			}, function () {
				delete S.pending[ key ];
			} );
		}
		return request;
	}

	function loadShelf() {
		ui.shelving.classList.remove( 'is-counter' );
		if ( S.shelfReq ) {
			S.shelfReq.abort();
		}
		var controller = typeof AbortController !== 'undefined' ? new AbortController() : { abort: function () {}, signal: undefined };
		S.shelfReq = controller;
		var query = shelfQuery( S.page );
		var place = placeKey( S.place ) + ':' + ( S.place.q || '' );

		if ( ! S.cache[ cacheKey( query ) ] ) {
			renderSkeleton();
		}
		fetchShelf( query, controller.signal ).then( function ( data ) {
			if ( S.shelfReq !== controller || placeKey( S.place ) + ':' + ( S.place.q || '' ) !== place ) {
				return;
			}
			S.shelfReq = null;
			renderShelf( data );
			checkTryOn( data.products );
			// The next shelf of this aisle is "nearby": fetch it quietly, nothing further.
			if ( S.page < data.pages ) {
				fetchShelf( shelfQuery( S.page + 1 ) ).catch( function () {} );
			}
		} ).catch( function ( err ) {
			if ( err && err.name === 'AbortError' ) {
				return;
			}
			if ( S.shelfReq !== controller ) {
				return;
			}
			S.shelfReq = null;
			ui.shelfNav.hidden = true;
			ui.shelving.textContent = '';
			ui.shelving.appendChild( notice( t.shelfFailed, [
				el( 'button', { type: 'button', className: 'aisleza-btn', onclick: loadShelf, text: t.retry } ),
				el( 'a', { className: 'aisleza-btn aisleza-btn--ghost', href: cfg.shopUrl, text: t.regularShop } )
			] ) );
			announce( t.shelfFailed, true );
		} );
	}

	function renderSkeleton() {
		ui.shelving.textContent = '';
		ui.shelving.setAttribute( 'aria-busy', 'true' );
		var list = el( 'ul', { className: 'aisleza-shelf is-loading', 'aria-label': t.loadingShelf } );
		for ( var i = 0; i < Math.min( cfg.perShelf, 8 ); i++ ) {
			list.appendChild( el( 'li', { className: 'aisleza-item aisleza-item--ghost', 'aria-hidden': 'true' }, [ el( 'span', { className: 'aisleza-product' }, [ el( 'span', { className: 'aisleza-product__display' } ) ] ) ] ) );
		}
		ui.shelving.appendChild( list );
	}

	function renderShelf( data ) {
		ui.shelving.textContent = '';
		ui.shelving.removeAttribute( 'aria-busy' );
		if ( ! data.products.length ) {
			ui.shelfNav.hidden = true;
			var text = S.place.type === 'search' ? fmt( t.noResults, S.place.q ) : t.emptyShelf;
			ui.shelving.appendChild( notice( text, [
				el( 'button', { type: 'button', className: 'aisleza-btn', onclick: function () {
					openMap( this );
				}, text: t.storeMap } ),
				el( 'a', { className: 'aisleza-btn aisleza-btn--ghost', href: cfg.shopUrl, text: t.regularShop } )
			] ) );
			return;
		}
		var label = data.pages > 1 ? fmt( t.shelfOf, signLabel(), S.page, data.pages ) : signLabel();
		var list = el( 'ul', { className: 'aisleza-shelf', 'aria-label': label } );
		data.products.forEach( function ( product, i ) {
			list.appendChild( productCard( product, i ) );
		} );
		ui.shelving.appendChild( list );
		ui.shelving.scrollTop = 0;

		ui.shelfNav.hidden = data.pages <= 1;
		ui.prevBtn.disabled = S.page <= 1;
		ui.nextBtn.disabled = S.page >= data.pages;
		ui.shelfLabel.textContent = fmt( t.shelfCount, S.page, data.pages );
		if ( S.place.type === 'search' ) {
			announce( fmt( t.resultsCount, data.total, S.place.q ) );
		} else if ( S.announceShelf ) {
			announce( fmt( t.shelfCount, S.page, data.pages ) );
		}
		S.announceShelf = false;
	}

	function turnShelf( step ) {
		S.page = Math.max( 1, S.page + step );
		if ( ! reduced() ) {
			mount.style.setProperty( '--aisleza-dir', String( step ) );
			ui.stage.classList.remove( 'is-arriving' );
			void ui.stage.offsetWidth;
			ui.stage.classList.add( 'is-arriving' );
		}
		S.announceShelf = true;
		loadShelf();
		ui.signTitle.focus( { preventScroll: true } );
	}

	function productCard( product, index ) {
		var price = Core.priceParts( product.prices );
		var image = product.images && product.images[ 0 ];
		var display = el( 'span', { className: 'aisleza-product__display' } );
		display.appendChild( image ? el( 'img', {
			src: image.thumbnail || image.src,
			srcset: image.thumbnail_srcset || null,
			sizes: image.thumbnail_srcset ? '(max-width: 640px) 45vw, 200px' : null,
			alt: '',
			loading: 'lazy',
			decoding: 'async'
		} ) : el( 'img', { src: cfg.placeholder, alt: '', className: 'is-placeholder', loading: 'lazy' } ) );

		var badges = el( 'span', { className: 'aisleza-badges' } );
		if ( price.onSale ) {
			badges.appendChild( el( 'span', { className: 'aisleza-badge aisleza-badge--sale', text: t.sale } ) );
		}
		if ( ! product.is_in_stock ) {
			badges.appendChild( el( 'span', { className: 'aisleza-badge aisleza-badge--out', text: t.outOfStock } ) );
		}
		var tryBadge = el( 'span', { className: 'aisleza-badge aisleza-badge--tryon', text: t.tryOnBadge, hidden: ! S.eligible[ product.id ] } );
		badges.appendChild( tryBadge );

		var tag = el( 'span', { className: 'aisleza-tag' }, [
			el( 'span', { className: 'aisleza-tag__name', text: plain( product.name ) } ),
			el( 'span', { className: 'aisleza-tag__price' }, [
				price.regular ? el( 's', { className: 'aisleza-tag__was' }, [ el( 'span', { className: 'aisleza-sr', text: t.was } ), price.regular ] ) : null,
				price.regular ? ' ' : null,
				price.onSale ? el( 'span', { className: 'aisleza-sr', text: t.now } ) : null,
				price.text || t.seeProduct
			] )
		] );

		var button = el( 'button', { type: 'button', className: 'aisleza-product', 'data-id': String( product.id ), 'aria-haspopup': 'dialog', onclick: function () {
			openProduct( product.id, button );
		} }, [ display, badges, tag ] );
		var item = el( 'li', { className: 'aisleza-item' }, [ button ] );
		item.style.setProperty( '--aisleza-i', String( index ) );
		return item;
	}

	/** Ask the optional try-on integration (via this plugin's REST route) which of these products it supports. */
	function checkTryOn( products ) {
		if ( ! cfg.tryon.available ) {
			return;
		}
		var ids = products.map( function ( p ) {
			return p.id;
		} ).filter( function ( id ) {
			return ! ( id in S.eligible );
		} );
		if ( ! ids.length ) {
			return;
		}
		getJSON( apiUrl( 'tryon', { ids: ids.join( ',' ) } ) ).then( function ( res ) {
			ids.forEach( function ( id ) {
				S.eligible[ id ] = res.json.eligible.indexOf( id ) !== -1;
				if ( S.world && S.eligible[ id ] ) {
					S.world.setEligible( id, true );
				}
			} );
			Array.prototype.forEach.call( ui.shelving.querySelectorAll( '.aisleza-product' ), function ( b ) {
				var badge = b.querySelector( '.aisleza-badge--tryon' );
				if ( badge ) {
					badge.hidden = ! S.eligible[ parseInt( b.getAttribute( 'data-id' ), 10 ) ];
				}
			} );
		} ).catch( function () {} );
	}

	/* ------------------------------------------------------------------ */
	/* Search                                                               */
	/* ------------------------------------------------------------------ */

	function runSearch( value, immediate ) {
		var q = String( value || '' ).trim().slice( 0, 100 );
		window.clearTimeout( ui.searchTimer );
		if ( q.length < 2 ) {
			if ( S.place.type === 'search' ) {
				go( { type: 'section', index: S.lastSection }, { fromSearch: true } );
			}
			return;
		}
		if ( S.place.type === 'search' && S.place.q === q && ! immediate ) {
			return;
		}
		go( { type: 'search', q: q }, { fromSearch: true } );
	}

	/* ------------------------------------------------------------------ */
	/* List view and map                                                    */
	/* ------------------------------------------------------------------ */

	function toggleList() {
		S.list = ! S.list;
		prefs.set( 'list', S.list );
		mount.classList.toggle( 'aisleza--list', S.list );
		ui.listBtn.setAttribute( 'aria-pressed', S.list ? 'true' : 'false' );
		if ( S.world ) {
			if ( S.list ) {
				if ( S.place.type === 'lobby' ) {
					S.place = { type: 'section', index: S.lastSection };
					renderAisles();
				}
				renderStage(); // The plain list replaces the 3D store.
			} else {
				mount.classList.remove( 'is-searching' );
				S.world.resize();
				S.world.focus();
			}
		}
		announce( S.list ? t.listOn : t.listOff );
	}

	function openMap( trigger ) {
		var body = ui.map.body;
		body.textContent = '';
		body.appendChild( el( 'h2', { id: 'aisleza-map-title', className: 'aisleza-dialog__title', text: t.storeMap } ) );
		var grid = el( 'ul', { className: 'aisleza-map' } );
		sections.forEach( function ( section, i ) {
			var b = el( 'button', { type: 'button', className: 'aisleza-map__aisle', 'aria-current': S.place.type === 'section' && S.place.index === i ? 'true' : null, onclick: function () {
				closeDialog();
				go( { type: 'section', index: i } );
				ui.signTitle.focus( { preventScroll: true } );
			} }, [
				el( 'span', { className: 'aisleza-map__name', text: section.label } ),
				el( 'span', { className: 'aisleza-map__count', text: fmt( section.count === 1 ? t.productCountOne : t.productCount, section.count ) } )
			] );
			b.style.setProperty( '--aisleza-section', section.accent || cfg.accent );
			b.style.setProperty( '--aisleza-section-ink', inkOn( section.accent || cfg.accent ) );
			grid.appendChild( el( 'li', {}, [ b ] ) );
		} );
		grid.appendChild( el( 'li', {}, [ el( 'button', { type: 'button', className: 'aisleza-map__aisle aisleza-map__aisle--counter', onclick: function () {
			closeDialog();
			go( { type: 'counter' } );
			ui.signTitle.focus( { preventScroll: true } );
		} }, [ el( 'span', { className: 'aisleza-map__name', text: t.checkoutCounter } ), el( 'span', { className: 'aisleza-map__count', text: t.payHere } ) ] ) ] ) );
		body.appendChild( grid );
		body.appendChild( el( 'p', { className: 'aisleza-map__alt' }, [ el( 'a', { href: cfg.shopUrl, text: t.regularShop } ) ] ) );
		showDialog( ui.map, trigger );
	}

	/* ------------------------------------------------------------------ */
	/* Product panel                                                        */
	/* ------------------------------------------------------------------ */

	var P = { token: 0 };

	function openProduct( id, trigger ) {
		var product = S.products[ id ];
		if ( ! product ) {
			return;
		}
		track( 'product', { id: product.id, name: plain( product.name ) } );
		P = {
			token: P.token + 1,
			product: product,
			selected: {},
			variation: null,
			detail: null,
			qty: Math.max( 1, product.add_to_cart && product.add_to_cart.minimum || 1 ),
			context: null,
			variationTryon: {},
			triedVariation: P.product && P.product.id === id ? P.triedVariation : 0
		};
		renderProduct();
		showDialog( ui.product, trigger, ui.product.panel.querySelector( '#aisleza-product-title' ) );
		loadContext();
	}

	function isBuyableType( product ) {
		return product.type === 'simple' || product.type === 'variable';
	}

	function renderProduct() {
		var product = P.product;
		var body = ui.product.body;
		body.textContent = '';

		var gallery = el( 'div', { className: 'aisleza-pd__gallery' } );
		P.mainImg = el( 'img', { className: 'aisleza-pd__img', alt: '' } );
		gallery.appendChild( el( 'div', { className: 'aisleza-pd__stage' }, [ P.mainImg ] ) );
		var images = product.images || [];
		if ( images.length > 1 ) {
			var thumbs = el( 'div', { className: 'aisleza-pd__thumbs', role: 'group', 'aria-label': t.gallery } );
			images.slice( 0, 8 ).forEach( function ( img, i ) {
				thumbs.appendChild( el( 'button', { type: 'button', className: 'aisleza-pd__thumb', 'aria-label': fmt( t.showImage, i + 1, Math.min( images.length, 8 ) ), onclick: function () {
					setImage( img );
				} }, [ el( 'img', { src: img.thumbnail || img.src, alt: '', loading: 'lazy' } ) ] ) );
			} );
			gallery.appendChild( thumbs );
		}
		setImage( images[ 0 ] );

		var info = el( 'div', { className: 'aisleza-pd__info' } );
		info.appendChild( el( 'h2', { id: 'aisleza-product-title', className: 'aisleza-pd__name', tabindex: '-1', text: plain( product.name ) } ) );
		P.priceEl = el( 'p', { className: 'aisleza-pd__price' } );
		P.stockEl = el( 'p', { className: 'aisleza-pd__stock' } );
		info.appendChild( P.priceEl );
		info.appendChild( P.stockEl );
		var desc = plain( product.short_description );
		if ( desc ) {
			info.appendChild( el( 'p', { className: 'aisleza-pd__desc', text: desc } ) );
		}

		P.optionsEl = el( 'div', { className: 'aisleza-pd__options' } );
		info.appendChild( P.optionsEl );
		P.qtyEl = el( 'div', { className: 'aisleza-pd__qty' } );
		info.appendChild( P.qtyEl );
		P.msgEl = el( 'div', { className: 'aisleza-pd__msg', role: 'status' } );

		var actions = el( 'div', { className: 'aisleza-pd__actions' } );
		P.addBtn = el( 'button', { type: 'button', className: 'aisleza-btn aisleza-btn--primary aisleza-btn--big', onclick: addToTrolley, text: t.addToTrolley } );
		P.tryBtn = el( 'button', { type: 'button', className: 'aisleza-btn aisleza-btn--tryon', hidden: true, 'aria-describedby': 'aisleza-tryon-note', onclick: tryOn }, [
			el( 'span', { className: 'aisleza-btn__spark', 'aria-hidden': 'true' } ),
			cfg.tryon.label || t.tryOn
		] );
		P.tryNote = el( 'p', { className: 'aisleza-pd__trynote', id: 'aisleza-tryon-note' } );
		if ( isBuyableType( product ) ) {
			actions.appendChild( P.addBtn );
		} else {
			actions.appendChild( el( 'a', { className: 'aisleza-btn aisleza-btn--primary aisleza-btn--big', href: product.permalink, text: product.type === 'grouped' || product.has_options ? t.configureProduct : t.viewProduct } ) );
		}
		actions.appendChild( P.tryBtn );
		info.appendChild( actions );
		info.appendChild( P.tryNote );
		info.appendChild( P.msgEl );
		info.appendChild( el( 'p', { className: 'aisleza-pd__link' }, [ el( 'a', { href: product.permalink, text: t.productPage } ) ] ) );

		body.appendChild( el( 'div', { className: 'aisleza-pd' }, [ gallery, info ] ) );

		renderOptions();
		refreshProduct();
	}

	function setImage( img ) {
		if ( ! P.mainImg ) {
			return;
		}
		if ( img && img.src ) {
			P.mainImg.src = img.src;
			if ( img.srcset ) {
				P.mainImg.srcset = img.srcset;
				P.mainImg.sizes = '(max-width: 640px) 90vw, 420px';
			} else {
				P.mainImg.removeAttribute( 'srcset' );
			}
			P.mainImg.alt = plain( img.alt ) || plain( P.product.name );
			P.mainImg.classList.remove( 'is-placeholder' );
		} else {
			P.mainImg.src = cfg.placeholder;
			P.mainImg.removeAttribute( 'srcset' );
			P.mainImg.alt = t.noImage;
			P.mainImg.classList.add( 'is-placeholder' );
		}
	}

	function renderOptions() {
		var product = P.product;
		P.optionsEl.textContent = '';
		if ( product.type !== 'variable' ) {
			return;
		}
		Core.variationAttributes( product ).forEach( function ( attr, i ) {
			var id = 'aisleza-opt-' + P.token + '-' + i;
			var select = el( 'select', { id: id, className: 'aisleza-select', 'data-name': attr.name } );
			select.appendChild( el( 'option', { value: '', text: fmt( t.chooseOption, attr.name ) } ) );
			var possible = Core.availableValues( product, attr.name, P.selected );
			( attr.terms || [] ).forEach( function ( term ) {
				var ok = possible.indexOf( term.slug ) !== -1;
				var opt = el( 'option', { value: term.slug, text: plain( term.name ) + ( ok ? '' : ' — ' + t.unavailable ) } );
				opt.disabled = ! ok;
				if ( P.selected[ attr.name ] === term.slug ) {
					opt.selected = true;
				}
				select.appendChild( opt );
			} );
			select.addEventListener( 'change', function () {
				P.selected[ attr.name ] = select.value;
				if ( P.msgEl.getAttribute( 'data-kind' ) === 'note' ) {
					setMessage( '' ); // "Matches what you tried" is no longer true.
				}
				onSelectionChange();
				var again = P.optionsEl.querySelector( '[data-name="' + attr.name.replace( /"/g, '\\"' ) + '"]' );
				if ( again ) {
					again.focus();
				}
			} );
			P.optionsEl.appendChild( el( 'div', { className: 'aisleza-field' }, [ el( 'label', { 'for': id, text: attr.name } ), select ] ) );
		} );
	}

	function onSelectionChange() {
		P.variation = Core.matchVariation( P.product, P.selected );
		P.detail = null;
		renderOptions();
		refreshProduct();
		if ( P.variation ) {
			loadVariation( P.variation.id );
		}
	}

	/** The product or chosen variation's purchase facts (variation detail overrides the parent). */
	function facts() {
		var src = P.detail || P.product;
		return {
			prices: src.prices,
			inStock: src.is_in_stock,
			purchasable: src.is_purchasable,
			stockText: plain( src.stock_availability && src.stock_availability.text ),
			stockClass: src.stock_availability && src.stock_availability.class || '',
			limits: src.add_to_cart || P.product.add_to_cart || {},
			soldIndividually: !! ( src.sold_individually || P.product.sold_individually )
		};
	}

	function refreshProduct() {
		var product = P.product;
		var f = facts();
		var price = Core.priceParts( f.prices );
		P.priceEl.textContent = '';
		if ( price.regular ) {
			P.priceEl.appendChild( el( 's', {}, [ el( 'span', { className: 'aisleza-sr', text: t.was } ), price.regular ] ) );
			P.priceEl.appendChild( document.createTextNode( ' ' ) );
			P.priceEl.appendChild( el( 'span', { className: 'aisleza-sr', text: t.now } ) );
		}
		P.priceEl.appendChild( el( 'strong', { text: price.text || '' } ) );

		var stock = f.stockText || ( f.inStock ? t.inStock : t.outOfStock );
		P.stockEl.textContent = stock;
		P.stockEl.className = 'aisleza-pd__stock' + ( f.inStock ? '' : ' is-out' ) + ( f.stockClass === 'available-on-backorder' ? ' is-backorder' : '' );

		/* Quantity */
		P.qtyEl.textContent = '';
		var min = Math.max( 1, parseInt( f.limits.minimum, 10 ) || 1 );
		var max = Math.max( min, parseInt( f.limits.maximum, 10 ) || 9999 );
		var step = Math.max( 1, parseInt( f.limits.multiple_of, 10 ) || 1 );
		P.qty = Math.min( max, Math.max( min, P.qty ) );
		if ( isBuyableType( product ) && ! f.soldIndividually && max > 1 ) {
			var input = el( 'input', { type: 'number', id: 'aisleza-qty', className: 'aisleza-qty__input', min: String( min ), max: String( max ), step: String( step ), value: String( P.qty ), inputmode: 'numeric' } );
			input.addEventListener( 'change', function () {
				var v = parseInt( input.value, 10 );
				P.qty = isNaN( v ) ? min : Math.min( max, Math.max( min, v ) );
				input.value = String( P.qty );
			} );
			var minus = el( 'button', { type: 'button', className: 'aisleza-qty__step', 'aria-label': t.decrease, onclick: function () {
				P.qty = Math.max( min, P.qty - step );
				input.value = String( P.qty );
			}, text: '−' } );
			var plus = el( 'button', { type: 'button', className: 'aisleza-qty__step', 'aria-label': t.increase, onclick: function () {
				P.qty = Math.min( max, P.qty + step );
				input.value = String( P.qty );
			}, text: '+' } );
			P.qtyEl.appendChild( el( 'label', { 'for': 'aisleza-qty', className: 'aisleza-qty__label', text: t.quantity } ) );
			P.qtyEl.appendChild( el( 'div', { className: 'aisleza-qty' }, [ minus, input, plus ] ) );
		} else if ( f.soldIndividually && isBuyableType( product ) ) {
			P.qty = 1;
			P.qtyEl.appendChild( el( 'p', { className: 'aisleza-pd__fine', text: t.soldIndividually } ) );
		}

		/* Add button state */
		var reason = '';
		if ( ! isBuyableType( product ) ) {
			reason = t.configureOnPage;
		} else if ( product.type === 'variable' && ! Core.selectionComplete( product, P.selected ) ) {
			reason = t.chooseOptions;
		} else if ( product.type === 'variable' && ! P.variation ) {
			reason = t.comboUnavailable;
		} else if ( product.type === 'variable' && ! P.detail ) {
			reason = t.checking;
		} else if ( ! f.inStock ) {
			reason = t.outOfStock;
		} else if ( ! f.purchasable ) {
			reason = t.notPurchasable;
		}
		// While adding, the button stays focusable (aria-disabled), so focus and Escape keep working.
		P.addBtn.disabled = !! reason;
		if ( P.adding ) {
			P.addBtn.setAttribute( 'aria-disabled', 'true' );
		} else {
			P.addBtn.removeAttribute( 'aria-disabled' );
		}
		P.addBtn.textContent = P.adding ? t.adding : t.addToTrolley;
		P.addReason = reason;
		if ( reason && reason !== t.checking && ! P.adding && ( P.msgEl.getAttribute( 'data-kind' ) !== 'ok' ) ) {
			setMessage( reason, 'info' );
		} else if ( ! reason && P.msgEl.getAttribute( 'data-kind' ) === 'info' ) {
			setMessage( '' );
		}

		refreshTryOn();
	}

	function setMessage( text, kind, actions ) {
		P.msgEl.textContent = '';
		P.msgEl.setAttribute( 'data-kind', kind || '' );
		P.msgEl.setAttribute( 'role', kind === 'error' ? 'alert' : 'status' );
		if ( ! text ) {
			return;
		}
		P.msgEl.appendChild( el( 'p', { className: 'aisleza-msg aisleza-msg--' + ( kind || 'info' ), text: text } ) );
		if ( actions && actions.length ) {
			P.msgEl.appendChild( el( 'p', { className: 'aisleza-msg__actions' }, actions ) );
		}
	}

	function loadContext() {
		var token = P.token;
		var id = P.product.id;
		if ( ! cfg.tryon.available && P.product.type !== 'variable' ) {
			return;
		}
		getJSON( apiUrl( 'product/' + id ) ).then( function ( res ) {
			if ( token !== P.token ) {
				return;
			}
			P.context = res.json;
			S.eligible[ id ] = !! res.json.tryon;
			var defaults = res.json.default_variation || {};
			if ( P.product.type === 'variable' && ! Object.keys( P.selected ).some( function ( k ) {
				return P.selected[ k ];
			} ) && Object.keys( defaults ).length ) {
				Core.variationAttributes( P.product ).forEach( function ( a ) {
					if ( defaults[ a.name ] ) {
						P.selected[ a.name ] = defaults[ a.name ];
					}
				} );
				onSelectionChange();
			} else {
				refreshTryOn();
			}
		} ).catch( function () {
			if ( token === P.token ) {
				P.context = { tryon: !! S.eligible[ id ], failed: true };
				refreshTryOn();
			}
		} );
	}

	function loadVariation( variationId ) {
		var token = P.token;
		var cached = S.products[ variationId ];
		var done = function ( detail ) {
			if ( token !== P.token || ! P.variation || P.variation.id !== variationId ) {
				return;
			}
			P.detail = detail;
			if ( detail.images && detail.images[ 0 ] ) {
				setImage( detail.images[ 0 ] );
			}
			refreshProduct();
		};
		if ( cached ) {
			done( cached );
		} else {
			getJSON( storeUrl( 'products/' + variationId ) ).then( function ( res ) {
				S.products[ variationId ] = res.json;
				done( res.json );
			} ).catch( function () {
				if ( token === P.token ) {
					setMessage( t.optionFailed, 'error', [ el( 'button', { type: 'button', className: 'aisleza-btn', onclick: function () {
						loadVariation( variationId );
					}, text: t.retry } ) ] );
				}
			} );
		}
		if ( cfg.tryon.available && P.context && P.context.tryon && ! ( variationId in P.variationTryon ) ) {
			getJSON( apiUrl( 'product/' + P.product.id, { variation: variationId } ) ).then( function ( res ) {
				if ( token !== P.token ) {
					return;
				}
				P.variationTryon[ variationId ] = !! res.json.variation_tryon;
				refreshTryOn();
			} ).catch( function () {} );
		}
	}

	/* --- Try-on ------------------------------------------------------- */

	function refreshTryOn() {
		if ( ! P.tryBtn ) {
			return;
		}
		var eligible = cfg.tryon.available && ( P.context ? P.context.tryon : S.eligible[ P.product.id ] );
		P.tryBtn.hidden = ! eligible;
		if ( ! eligible ) {
			P.tryNote.textContent = '';
			return;
		}
		var note = '';
		var disabled = false;
		var v = P.variation;
		if ( v && v.id in P.variationTryon && ! P.variationTryon[ v.id ] ) {
			disabled = true;
			note = t.optionNoTryOn;
		} else if ( P.triedVariation && v && v.id !== P.triedVariation ) {
			note = t.newTryOnNeeded;
		} else {
			note = t.tryOnNote;
		}
		var state = bridge ? bridge.state : 'unavailable';
		if ( state === 'loading' ) {
			P.tryBtn.setAttribute( 'aria-busy', 'true' );
			note = t.tryOnOpening;
		} else {
			P.tryBtn.removeAttribute( 'aria-busy' );
		}
		P.tryBtn.disabled = disabled || state === 'loading';
		P.tryNote.textContent = note;
	}

	function tryOn() {
		if ( ! bridge || P.tryBtn.disabled || bridge.busy() || P.tryChecking ) {
			return;
		}
		leaveFullScreen();
		var v = P.variation;
		var variationId = v && P.variationTryon[ v.id ] !== false ? v.id : 0;
		var token = P.token;
		var id = P.product.id;
		// Re-check with the server first: the integration may have been switched off since the
		// page loaded. Then the shopper gets a plain message instead of a broken fitting room.
		P.tryChecking = true;
		P.tryBtn.setAttribute( 'aria-busy', 'true' );
		getJSON( apiUrl( 'product/' + id ) ).then( function ( res ) {
			return !! res.json.tryon;
		}, function () {
			return false;
		} ).then( function ( still ) {
			P.tryChecking = false;
			if ( token !== P.token ) {
				return;
			}
			P.tryBtn.removeAttribute( 'aria-busy' );
			if ( ! still ) {
				S.eligible[ id ] = false;
				if ( P.context ) {
					P.context.tryon = false;
				}
				refreshTryOn();
				setMessage( t.tryOnGone, 'info' );
				announce( t.tryOnGone );
				return;
			}
			if ( bridge.open( { productId: id, variationId: variationId, trigger: P.tryBtn } ) ) {
				refreshTryOn();
			}
		} );
	}

	function onFittingRoom( state, detail ) {
		var mine = P.product && detail.productId === P.product.id;
		if ( state === 'closed' ) {
			mount.classList.remove( 'is-fitting' );
			syncCart();
			if ( mine ) {
				if ( detail.hadResult ) {
					P.triedVariation = detail.variationId || 0;
				}
				if ( detail.changedVariation && P.product.type === 'variable' ) {
					var tried = ( P.product.variations || [] ).filter( function ( v ) {
						return v.id === detail.changedVariation;
					} )[ 0 ];
					if ( tried ) {
						P.selected = Core.selectionFor( P.product, tried, P.selected );
						onSelectionChange();
						setMessage( t.selectionFromFitting, 'note' ); // 'note' survives refreshProduct(), unlike 'info'.
					}
				}
				refreshTryOn();
			}
			announce( t.backFromFitting );
			return;
		}
		if ( state === 'open' || state === 'result' ) {
			mount.classList.add( 'is-fitting' );
		}
		if ( state === 'failed' && mine ) {
			setMessage( t.tryOnFailed, 'error' );
			announce( t.tryOnFailed, true );
		}
		if ( mine ) {
			refreshTryOn();
		}
	}

	/* --- Add to trolley ------------------------------------------------ */

	function addToTrolley() {
		var product = P.product;
		if ( P.adding || P.addBtn.disabled ) {
			return;
		}
		var payload;
		var itemId;
		var label = plain( product.name );
		if ( product.type === 'variable' ) {
			payload = { id: P.variation.id, quantity: P.qty, variation: Core.variationPayload( product, P.selected ) };
			itemId = P.variation.id;
			var detailName = P.detail && P.detail.variation ? plain( P.detail.variation ) : '';
			label = detailName ? label + ' (' + detailName + ')' : label;
		} else {
			payload = { id: product.id, quantity: P.qty };
			itemId = product.id;
		}
		var token = P.token;
		var qty = P.qty;
		P.adding = true;
		setMessage( '' );
		refreshProduct();
		cart.add( payload, itemId ).then( function () {
			track( 'add', { id: itemId, quantity: qty, name: plain( product.name ) } );
			P.adding = false;
			if ( token === P.token ) {
				refreshProduct();
				setMessage( fmt( t.added, qty, label ), 'ok', [
					el( 'button', { type: 'button', className: 'aisleza-btn', onclick: function () {
						openTrolley( P.addBtn );
					}, text: t.viewTrolley } ),
					el( 'button', { type: 'button', className: 'aisleza-btn aisleza-btn--ghost', onclick: function () {
						closeDialog();
					}, text: t.keepShopping } )
				] );
				flyToTrolley( P.mainImg );
			}
			announce( fmt( t.added, qty, label ) );
			notifyOthers();
		} ).catch( function ( err ) {
			P.adding = false;
			var text = err.code === 'not_added' ? t.notAdded : ( err.code === 'uncertain' ? t.uncertain : ( err.message || t.network ) );
			if ( token === P.token ) {
				refreshProduct();
				setMessage( plain( text ), 'error', err.code === 'uncertain' ? [ el( 'button', { type: 'button', className: 'aisleza-btn', onclick: function () {
					openTrolley( P.addBtn );
				}, text: t.checkTrolley } ) ] : null );
			}
			announce( plain( text ), true );
		} );
	}

	function visibleTrolley() {
		return ui.sceneTrolley.offsetParent ? ui.sceneTrolley : ui.barTrolley;
	}

	/** Only after the server confirmed the line: an image flies into the trolley. */
	function flyToTrolley( source ) {
		var target = visibleTrolley();
		if ( reduced() || ! source || ! source.getBoundingClientRect || ! target.animate ) {
			bump();
			return;
		}
		var a = source.getBoundingClientRect();
		var b = target.getBoundingClientRect();
		if ( ! a.width || ! b.width ) {
			bump();
			return;
		}
		var ghost = el( 'img', { src: source.currentSrc || source.src, alt: '', className: 'aisleza-fly', 'aria-hidden': 'true' } );
		var size = Math.min( 120, a.width );
		ghost.style.width = size + 'px';
		ghost.style.height = size + 'px';
		ghost.style.left = ( a.left + a.width / 2 - size / 2 ) + 'px';
		ghost.style.top = ( a.top + a.height / 2 - size / 2 ) + 'px';
		document.body.appendChild( ghost );
		var dx = b.left + b.width / 2 - ( a.left + a.width / 2 );
		var dy = b.top + b.height / 3 - ( a.top + a.height / 2 );
		var anim = ghost.animate( [
			{ transform: 'translate(0,0) scale(1)', opacity: 1 },
			{ transform: 'translate(' + ( dx * 0.5 ) + 'px,' + ( dy * 0.5 - 80 ) + 'px) scale(.6)', opacity: 1, offset: 0.5 },
			{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.18)', opacity: 0.4 }
		], { duration: 650, easing: 'cubic-bezier(.4,.1,.3,1)' } );
		anim.onfinish = function () {
			ghost.remove();
			bump();
		};
	}

	function bump() {
		if ( S.world ) {
			S.world.bump();
		}
		[ ui.sceneTrolley, ui.barTrolley ].forEach( function ( b ) {
			b.classList.remove( 'is-bumped' );
			void b.offsetWidth;
			b.classList.add( 'is-bumped' );
		} );
	}

	/* ------------------------------------------------------------------ */
	/* Trolley (cart)                                                       */
	/* ------------------------------------------------------------------ */

	function subtotalAmount( c ) {
		var tt = c.totals || {};
		return ( parseInt( tt.total_items, 10 ) || 0 ) + ( cfg.taxIncl ? parseInt( tt.total_items_tax, 10 ) || 0 : 0 );
	}

	function discountAmount( c ) {
		var tt = c.totals || {};
		return ( parseInt( tt.total_discount, 10 ) || 0 ) + ( cfg.taxIncl ? parseInt( tt.total_discount_tax, 10 ) || 0 : 0 );
	}

	function money( amount, c ) {
		return Core.formatMoney( amount, c && c.totals ? c.totals : cfg.currency );
	}

	function itemsLabel( units ) {
		return fmt( units === 1 ? t.itemOne : t.items, units );
	}

	function renderCart() {
		var c = S.cart;
		var units = Core.cartUnits( c );
		var summary = c ? itemsLabel( units ) + ' · ' + fmt( t.subtotalShort, money( subtotalAmount( c ), c ) ) : ( S.cartFailed ? t.trolleyUnavailable : t.loadingTrolley );
		ui.summaryText.textContent = summary;
		var label = c ? fmt( t.trolleyButton, itemsLabel( units ) ) : t.trolley;
		[ ui.sceneTrolley, ui.barTrolley ].forEach( function ( b ) {
			b.setAttribute( 'aria-label', label );
			b.querySelector( '.aisleza-trolley__count' ).textContent = String( units );
			b.classList.toggle( 'has-items', units > 0 );
			var pile = b.querySelector( '.aisleza-cart-art__items' );
			pile.textContent = '';
			( c && c.items || [] ).slice( -4 ).forEach( function ( item, i ) {
				var img = item.images && item.images[ 0 ];
				pile.appendChild( el( 'img', { src: img ? img.thumbnail || img.src : cfg.placeholder, alt: '', style: '--aisleza-n:' + i } ) );
			} );
		} );
		if ( openDialog === ui.trolley ) {
			renderTrolleyBody();
		}
		if ( S.world && c ) {
			S.world.setCart( c.items );
		}
		if ( S.place.type === 'counter' && S.view === 'store' ) {
			if ( S.world && ! S.list ) {
				renderCounterHud();
			} else {
				renderCounter();
			}
		}
	}

	function lineTotal( item ) {
		var tt = item.totals || {};
		return ( parseInt( tt.line_subtotal, 10 ) || 0 ) + ( cfg.taxIncl ? parseInt( tt.line_subtotal_tax, 10 ) || 0 : 0 );
	}

	function openTrolley( trigger ) {
		renderTrolleyBody();
		showDialog( ui.trolley, trigger, ui.trolley.panel.querySelector( '#aisleza-trolley-title' ) );
		syncCart();
	}

	function renderTrolleyBody() {
		var body = ui.trolley.body;
		var c = S.cart;
		var keepFocus = document.activeElement && body.contains( document.activeElement ) ? document.activeElement.getAttribute( 'data-focus' ) : null;
		body.textContent = '';
		body.appendChild( el( 'h2', { id: 'aisleza-trolley-title', className: 'aisleza-dialog__title', tabindex: '-1', text: t.yourTrolley } ) );

		if ( ! c ) {
			body.appendChild( notice( S.cartFailed ? t.trolleyUnavailable : t.loadingTrolley, S.cartFailed ? [ el( 'button', { type: 'button', className: 'aisleza-btn', onclick: syncCart, text: t.retry } ) ] : null ) );
			return;
		}
		( c.errors || [] ).forEach( function ( e ) {
			body.appendChild( el( 'p', { className: 'aisleza-msg aisleza-msg--error', text: plain( e.message ) } ) );
		} );
		if ( ! c.items.length ) {
			var empty = el( 'div', { className: 'aisleza-empty' }, [
				el( 'span', { className: 'aisleza-empty__art' }, [ trolleyArt() ] ),
				el( 'p', { text: t.emptyTrolley } )
			] );
			var aisles = el( 'p', { className: 'aisleza-notice__actions' } );
			sections.slice( 0, 4 ).forEach( function ( section, i ) {
				aisles.appendChild( el( 'button', { type: 'button', className: 'aisleza-btn aisleza-btn--ghost', onclick: function () {
					closeDialog();
					go( { type: 'section', index: i } );
				}, text: section.label } ) );
			} );
			empty.appendChild( aisles );
			body.appendChild( empty );
			return;
		}

		var list = el( 'ul', { className: 'aisleza-lines' } );
		c.items.forEach( function ( item ) {
			list.appendChild( lineRow( item, c ) );
		} );
		body.appendChild( list );

		var totals = el( 'dl', { className: 'aisleza-totals' } );
		totals.appendChild( el( 'dt', { text: t.subtotal } ) );
		totals.appendChild( el( 'dd', { text: money( subtotalAmount( c ), c ) } ) );
		if ( discountAmount( c ) > 0 ) {
			totals.appendChild( el( 'dt', { text: t.discount } ) );
			totals.appendChild( el( 'dd', { text: '−' + money( discountAmount( c ), c ) } ) );
		}
		body.appendChild( totals );
		body.appendChild( el( 'p', { className: 'aisleza-pd__fine', text: cfg.taxIncl ? t.shippingLater : t.shippingTaxLater } ) );

		var go2 = el( 'p', { className: 'aisleza-trolley__actions' } );
		var checkout = el( 'a', { className: 'aisleza-btn aisleza-btn--primary aisleza-btn--big', href: cfg.checkoutUrl, text: t.checkout } );
		checkout.addEventListener( 'click', guardCheckout );
		go2.appendChild( checkout );
		go2.appendChild( el( 'a', { className: 'aisleza-btn aisleza-btn--ghost', href: cfg.cartUrl, text: t.viewCart } ) );
		go2.appendChild( el( 'button', { type: 'button', className: 'aisleza-btn aisleza-btn--ghost', onclick: function () {
			closeDialog();
		}, text: t.keepShopping } ) );
		body.appendChild( go2 );

		if ( keepFocus ) {
			var again = body.querySelector( '[data-focus="' + keepFocus + '"]' );
			( again && ! again.disabled ? again : body.querySelector( '#aisleza-trolley-title' ) ).focus( { preventScroll: true } );
		}
	}

	function lineRow( item, c ) {
		var img = item.images && item.images[ 0 ];
		var name = plain( item.name );
		var limits = item.quantity_limits || {};
		var min = Math.max( 1, parseInt( limits.minimum, 10 ) || 1 );
		var max = parseInt( limits.maximum, 10 ) || 9999;
		var step = Math.max( 1, parseInt( limits.multiple_of, 10 ) || 1 );
		var editable = limits.editable !== false && ! item.sold_individually;
		var variation = ( item.variation || [] ).map( function ( v ) {
			return plain( v.attribute ) + ': ' + plain( v.value );
		} ).join( ' · ' );

		var row = el( 'li', { className: 'aisleza-line' } );
		row.appendChild( el( 'img', { className: 'aisleza-line__img', src: img ? img.thumbnail || img.src : cfg.placeholder, alt: '', loading: 'lazy' } ) );
		var info = el( 'div', { className: 'aisleza-line__info' }, [
			el( 'p', { className: 'aisleza-line__name', text: name } ),
			variation ? el( 'p', { className: 'aisleza-line__variation', text: variation } ) : null,
			el( 'p', { className: 'aisleza-line__price', text: money( lineTotal( item ), c ) } )
		] );
		row.appendChild( info );

		var controls = el( 'div', { className: 'aisleza-line__controls' } );
		if ( editable ) {
			var qty = el( 'span', { className: 'aisleza-line__qty', 'aria-live': 'polite', text: String( item.quantity ) } );
			var minus = el( 'button', { type: 'button', className: 'aisleza-qty__step', 'data-focus': item.key + '-minus', 'aria-label': fmt( t.decreaseItem, name ), onclick: function () {
				changeQty( item, item.quantity - step );
			}, text: '−' } );
			minus.disabled = item.quantity - step < min;
			var plus = el( 'button', { type: 'button', className: 'aisleza-qty__step', 'data-focus': item.key + '-plus', 'aria-label': fmt( t.increaseItem, name ), onclick: function () {
				changeQty( item, item.quantity + step );
			}, text: '+' } );
			plus.disabled = item.quantity + step > max;
			controls.appendChild( el( 'div', { className: 'aisleza-qty', role: 'group', 'aria-label': fmt( t.quantityOf, name ) }, [ minus, qty, plus ] ) );
		} else {
			controls.appendChild( el( 'span', { className: 'aisleza-line__qty', text: fmt( t.qtyFixed, item.quantity ) } ) );
		}
		controls.appendChild( el( 'button', { type: 'button', className: 'aisleza-line__remove', 'data-focus': item.key + '-remove', onclick: function () {
			removeLine( item );
		}, text: t.remove, 'aria-label': fmt( t.removeItem, name ) } ) );
		row.appendChild( controls );
		if ( item.key === S.pendingLine ) {
			row.classList.add( 'is-pending' );
			row.setAttribute( 'aria-busy', 'true' );
		}
		return row;
	}

	function changeQty( item, quantity ) {
		S.pendingLine = item.key;
		renderTrolleyBody();
		cart.update( item.key, quantity ).then( function () {
			announce( fmt( t.qtyUpdated, plain( item.name ), quantity ) );
			notifyOthers();
		} ).catch( function ( err ) {
			announce( plain( err.message || t.network ), true );
			flash( plain( err.message || t.network ) );
		} ).then( function () {
			S.pendingLine = null;
			renderTrolleyBody();
		} );
	}

	function removeLine( item ) {
		S.pendingLine = item.key;
		renderTrolleyBody();
		cart.remove( item.key ).then( function () {
			announce( fmt( t.removed, plain( item.name ) ) );
			notifyOthers();
		} ).catch( function ( err ) {
			announce( plain( err.message || t.network ), true );
			flash( plain( err.message || t.network ) );
		} ).then( function () {
			S.pendingLine = null;
			renderTrolleyBody();
			if ( openDialog === ui.trolley && ! ui.trolley.body.contains( document.activeElement ) ) {
				ui.trolley.body.querySelector( '#aisleza-trolley-title' ).focus( { preventScroll: true } );
			}
		} );
	}

	function flash( text ) {
		if ( openDialog === ui.trolley ) {
			var p = el( 'p', { className: 'aisleza-msg aisleza-msg--error', role: 'alert', text: text } );
			var title = ui.trolley.body.querySelector( '#aisleza-trolley-title' );
			if ( title ) {
				title.parentNode.insertBefore( p, title.nextSibling );
			}
		}
	}

	/** Wait for queued trolley changes before leaving for checkout. */
	function guardCheckout( e ) {
		track( 'checkout' );
		if ( ! cart.busy() ) {
			return;
		}
		e.preventDefault();
		var link = e.currentTarget;
		link.setAttribute( 'aria-busy', 'true' );
		announce( t.savingTrolley );
		cart.idle().then( function () {
			window.location.href = link.href;
		} );
	}

	/* ------------------------------------------------------------------ */
	/* Checkout counter                                                     */
	/* ------------------------------------------------------------------ */

	function renderCounter() {
		ui.shelving.textContent = '';
		ui.shelving.classList.add( 'is-counter' );
		ui.shelving.removeAttribute( 'aria-busy' );
		var desk = el( 'div', { className: 'aisleza-counter' } );
		desk.appendChild( el( 'div', { className: 'aisleza-counter__desk', 'aria-hidden': 'true' }, [
			el( 'span', { className: 'aisleza-counter__register' } ),
			el( 'span', { className: 'aisleza-counter__belt' } ),
			el( 'span', { className: 'aisleza-counter__lamp', text: t.checkoutLamp } )
		] ) );
		desk.appendChild( counterCard() );
		ui.shelving.appendChild( desk );
	}

	/** The pay card at the checkout counter (2.5D desk and the 3D checkout lane). */
	function counterCard() {
		var c = S.cart;
		var card = el( 'div', { className: 'aisleza-counter__card' } );
		if ( ! c ) {
			card.appendChild( el( 'p', { text: S.cartFailed ? t.trolleyUnavailable : t.loadingTrolley } ) );
		} else if ( ! c.items.length ) {
			card.appendChild( el( 'p', { text: t.counterEmpty } ) );
			card.appendChild( el( 'p', {}, [ el( 'button', { type: 'button', className: 'aisleza-btn', onclick: function () {
				go( { type: 'section', index: S.lastSection } );
			}, text: t.backToAisles } ) ] ) );
		} else {
			card.appendChild( el( 'p', { className: 'aisleza-counter__count', text: itemsLabel( Core.cartUnits( c ) ) } ) );
			card.appendChild( el( 'p', { className: 'aisleza-counter__total' }, [ el( 'span', { text: t.subtotal + ' ' } ), el( 'strong', { text: money( subtotalAmount( c ), c ) } ) ] ) );
			card.appendChild( el( 'p', { className: 'aisleza-pd__fine', text: cfg.taxIncl ? t.shippingLater : t.shippingTaxLater } ) );
			var pay = el( 'a', { className: 'aisleza-btn aisleza-btn--primary aisleza-btn--big', href: cfg.checkoutUrl, text: t.payAtCheckout } );
			pay.addEventListener( 'click', guardCheckout );
			card.appendChild( el( 'p', { className: 'aisleza-trolley__actions' }, [
				pay,
				el( 'button', { type: 'button', className: 'aisleza-btn aisleza-btn--ghost', onclick: function () {
					openTrolley( this );
				}, text: t.reviewTrolley } )
			] ) );
		}
		return card;
	}

	/* ------------------------------------------------------------------ */
	/* Cart sync                                                            */
	/* ------------------------------------------------------------------ */

	var cart = new Core.CartStore( {
		root: cfg.storeApi,
		fetch: window.fetch.bind( window ),
		messages: { network: t.network, uncertain: t.uncertain, notAdded: t.notAdded },
		onChange: function ( c ) {
			S.cart = c;
			S.cartFailed = false;
			S.lastSync = Date.now();
			if ( c && c.totals ) {
				cfg.currency = c.totals;
			}
			renderCart();
		}
	} );

	function syncCart() {
		return cart.load().catch( function () {
			if ( ! S.cart ) {
				S.cartFailed = true;
				renderCart();
			}
		} );
	}

	/** Let a theme mini-cart on the same page refresh after the trolley changed. */
	function notifyOthers() {
		if ( window.jQuery ) {
			window.jQuery( document.body ).trigger( 'wc_fragment_refresh' );
		}
	}

	function listenForOtherCarts() {
		document.addEventListener( 'visibilitychange', function () {
			if ( document.visibilityState === 'visible' && Date.now() - S.lastSync > 2000 ) {
				syncCart();
			}
		} );
		window.addEventListener( 'pageshow', function ( e ) {
			if ( e.persisted ) {
				syncCart();
			}
		} );
		window.addEventListener( 'storage', function ( e ) {
			// WooCommerce's cart fragments write a cart hash when another tab changes the cart.
			if ( e.key && /wc_cart_hash|wc_fragments/.test( e.key ) ) {
				syncCart();
			}
		} );
		[ 'wc-blocks_added_to_cart', 'wc-blocks_removed_from_cart' ].forEach( function ( name ) {
			document.body.addEventListener( name, syncCart );
		} );
		if ( window.jQuery ) {
			window.jQuery( document.body ).on( 'added_to_cart removed_from_cart wc_cart_emptied updated_cart_totals', function () {
				syncCart();
			} );
		}
	}

	/* ------------------------------------------------------------------ */
	/* Boot                                                                 */
	/* ------------------------------------------------------------------ */

	var bridge = BridgeLib && cfg.tryon.available ? new BridgeLib.Bridge( {
		config: cfg.tryon.config,
		win: window,
		doc: document,
		onState: onFittingRoom
	} ) : null;

	build();
	renderCart();
	listenForOtherCarts();
	syncCart();

	if ( sections.length ) {
		fetchShelf( sectionQuery( sections[ 0 ], { per_page: cfg.perShelf, page: 1, orderby: cfg.orderby, order: cfg.order, catalog_visibility: 'catalog' } ) ).then( function ( data ) {
			fillWindows( data.products );
		} ).catch( function () {} );
	}

	/*
	 * Design preview: an add-on's store designer shows this page in a frame on the settings page
	 * (the add-on sets cfg.designPreview, only for store managers). The page opens straight into
	 * the store, and a new skin sent by that settings page (same site only) rebuilds the 3D
	 * store around the same view.
	 */
	if ( cfg.designPreview ) {
		mount.classList.add( 'is-design-preview' ); // The 3D store fills the frame (store.css).
		window.addEventListener( 'message', function ( e ) {
			if ( e.origin !== window.location.origin || e.source !== window.parent || ! e.data || 'aisleza-design' !== e.data.type ) {
				return;
			}
			cfg.skin = e.data.skin && 'object' === typeof e.data.skin ? e.data.skin : null;
			if ( ! S.world ) {
				return; // Still loading: it starts with the new skin.
			}
			var view = S.world.getView();
			S.world.destroy();
			ui.worldBox.remove();
			ui.worldList.remove();
			ui.hudCounter.remove();
			S.world = null;
			mount.classList.remove( 'is-3d' );
			startWorld();
			if ( S.world ) {
				S.world.setView( view );
			}
		} );
	}

	if ( saved.entered || cfg.designPreview ) {
		showStore( false );
	} else {
		ui.enterBtn.focus( { preventScroll: true } );
	}
}() );
