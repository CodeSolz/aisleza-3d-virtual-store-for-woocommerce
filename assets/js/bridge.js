/**
 * Aisleza — optional try-on bridge (WearGraph's fitting room).
 *
 * Loaded only when the WearGraph integration is ready (see Integrations\WearGraph). The store
 * works without it.
 *
 * Loads WearGraph's fitting-room script/style (the same URLs its Try On button loads, plus
 * add-on scripts such as WearGraph Pro's) and calls window.WearGraphFittingRoom.open(). The
 * fitting room keeps doing everything itself: consent, photo, quotas, the generation and
 * polling. The bridge only reports where the shopper is:
 *
 *   idle → loading → open → result → closed      (failed when the fitting room cannot load)
 *
 * State comes from WearGraph's events: weargraph:fitting-room-view (every step; view
 * "result" = a finished try-on) and weargraph:fitting-room-closed (WearGraph > 1.0.0). On
 * WearGraph 1.0.0, which has no close event, closing is detected from the dialog's hidden
 * attribute.
 */
( function ( root, factory ) {
	'use strict';
	var api = factory();
	if ( typeof module === 'object' && module.exports ) {
		module.exports = api;
	} else {
		root.AislezaBridge = api;
	}
}( typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	/**
	 * options: { config (WearGraph client config), win, doc, onState( state, detail ) }
	 */
	function Bridge( options ) {
		this.config = options.config || null;
		this.win = options.win;
		this.doc = options.doc;
		this.onState = options.onState || function () {};
		this.state = this.config ? 'idle' : 'unavailable';
		this.loading = null;
		this.visit = 0;
		this.current = null;
		this.observer = null;
		this.listen();
	}

	Bridge.prototype.available = function () {
		return this.state !== 'unavailable';
	};

	Bridge.prototype.busy = function () {
		return this.state === 'loading' || this.state === 'open' || this.state === 'result';
	};

	Bridge.prototype.set = function ( state, detail ) {
		this.state = state;
		this.onState( state, detail || {} );
	};

	/** Load the fitting room once (CSS + JS, then WearGraph's add-on scripts). */
	Bridge.prototype.load = function () {
		var self = this;
		var win = self.win;
		var doc = self.doc;
		if ( win.WearGraphFittingRoom ) {
			return Promise.resolve();
		}
		if ( self.loading ) {
			return self.loading;
		}
		self.loading = new Promise( function ( resolve, reject ) {
			var css = doc.createElement( 'link' );
			css.rel = 'stylesheet';
			css.href = self.config.modalCss;
			doc.head.appendChild( css );

			var js = doc.createElement( 'script' );
			js.src = self.config.modalJs;
			js.async = true;
			js.onload = function () {
				( self.config.extraJs || [] ).forEach( function ( src ) {
					var extra = doc.createElement( 'script' );
					extra.src = src;
					extra.async = true;
					doc.body.appendChild( extra );
				} );
				if ( win.WearGraphFittingRoom ) {
					resolve();
				} else {
					self.loading = null;
					reject( new Error( 'missing' ) );
				}
			};
			js.onerror = function () {
				self.loading = null;
				reject( new Error( 'load' ) );
			};
			doc.body.appendChild( js );
		} );
		return self.loading;
	};

	/**
	 * Open the fitting room for a product and (optionally) the chosen variation. Returns
	 * false when another visit is still running, so repeated clicks never start a second one.
	 */
	Bridge.prototype.open = function ( request ) {
		var self = this;
		if ( ! self.available() || self.busy() ) {
			return false;
		}
		self.visit++;
		var visit = self.visit;
		self.current = {
			visit: visit,
			productId: request.productId,
			variationId: request.variationId || 0,
			lastVariation: request.variationId || 0,
			result: false
		};
		self.set( 'loading', { productId: request.productId } );

		self.load().then( function () {
			if ( visit !== self.visit ) {
				return;
			}
			self.win.WearGraphFittingRoom.open( {
				productId: request.productId,
				variationId: request.variationId || 0,
				trigger: request.trigger,
				config: self.config
			} );
			self.set( 'open', { productId: request.productId } );
			self.watch();
		} ).catch( function () {
			if ( visit !== self.visit ) {
				return;
			}
			self.current = null;
			self.set( 'failed', { productId: request.productId, reason: 'load' } );
		} );
		return true;
	};

	Bridge.prototype.listen = function () {
		var self = this;
		if ( ! self.doc || ! self.doc.addEventListener ) {
			return;
		}
		self.doc.addEventListener( 'weargraph:fitting-room-view', function ( event ) {
			self.onView( event.detail || {} );
		} );
		self.doc.addEventListener( 'weargraph:fitting-room-closed', function ( event ) {
			self.onClosed( event.detail || {} );
		} );
	};

	Bridge.prototype.onView = function ( detail ) {
		var cur = this.current;
		if ( ! cur || ( detail.product && detail.product.id && detail.product.id !== cur.productId ) ) {
			return; // Not our visit (another Try On button on the page).
		}
		if ( detail.variation ) {
			cur.lastVariation = detail.variation;
		}
		if ( detail.view === 'result' ) {
			cur.result = true;
			this.set( 'result', { productId: cur.productId, variationId: cur.lastVariation } );
		} else if ( this.state !== 'open' ) {
			this.set( 'open', { productId: cur.productId } );
		}
	};

	Bridge.prototype.onClosed = function ( detail ) {
		var cur = this.current;
		if ( ! cur ) {
			return;
		}
		if ( detail && detail.variation ) {
			cur.lastVariation = detail.variation;
		}
		this.current = null;
		this.unwatch();
		this.set( 'closed', {
			productId: cur.productId,
			variationId: cur.lastVariation,
			changedVariation: cur.lastVariation !== cur.variationId ? cur.lastVariation : 0,
			hadResult: cur.result
		} );
		this.state = 'idle';
	};

	/** WearGraph 1.0.0 fallback: watch the fitting-room dialog's hidden attribute. */
	Bridge.prototype.watch = function () {
		var self = this;
		var dialog = self.doc.querySelector ? self.doc.querySelector( '.wgfr' ) : null;
		if ( ! dialog || typeof self.win.MutationObserver !== 'function' ) {
			return;
		}
		self.unwatch();
		self.observer = new self.win.MutationObserver( function () {
			if ( dialog.hidden ) {
				self.onClosed( {} );
			}
		} );
		self.observer.observe( dialog, { attributes: true, attributeFilter: [ 'hidden' ] } );
	};

	Bridge.prototype.unwatch = function () {
		if ( this.observer ) {
			this.observer.disconnect();
			this.observer = null;
		}
	};

	return { Bridge: Bridge };
} ) );
