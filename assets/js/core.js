/**
 * Aisleza — core logic with no DOM: money, URLs, variations and the
 * trolley's cart store. Loaded as window.AislezaCore in the browser and as a CommonJS module
 * in the tests (tests/js).
 *
 * The cart is WooCommerce's: every read and write goes to the Store API on the shopper's
 * normal cookie session (no Cart-Token header), so the regular cart and checkout see the
 * same items. Nothing about the cart is stored in the browser.
 */
( function ( root, factory ) {
	'use strict';
	var api = factory();
	if ( typeof module === 'object' && module.exports ) {
		module.exports = api;
	} else {
		root.AislezaCore = api;
	}
}( typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	/* ------------------------------------------------------------------ */
	/* URLs                                                                 */
	/* ------------------------------------------------------------------ */

	function encodeParams( params ) {
		return Object.keys( params || {} ).filter( function ( key ) {
			return params[ key ] !== undefined && params[ key ] !== null && params[ key ] !== '';
		} ).map( function ( key ) {
			return encodeURIComponent( key ) + '=' + encodeURIComponent( params[ key ] );
		} ).join( '&' );
	}

	/**
	 * REST URL. With plain permalinks the root is ".../?rest_route=/", so the query string
	 * joins with "&" (as WordPress itself does).
	 */
	function restUrl( root, path, params ) {
		var url = root + String( path ).replace( /^\//, '' );
		var qs = encodeParams( params );
		if ( ! qs ) {
			return url;
		}
		return url + ( url.indexOf( '?' ) === -1 ? '?' : '&' ) + qs;
	}

	/* ------------------------------------------------------------------ */
	/* Money                                                                */
	/* ------------------------------------------------------------------ */

	/**
	 * Format an amount in minor units ("4200") with Store API currency data
	 * (currency_minor_unit, separators, prefix, suffix). Never assumes 2 decimals or "$".
	 */
	function formatMoney( amount, currency ) {
		var c = currency || {};
		var unit = parseInt( c.currency_minor_unit, 10 );
		unit = isNaN( unit ) ? 2 : Math.max( 0, unit );
		var raw = String( amount === undefined || amount === null || amount === '' ? '0' : amount ).trim();
		var negative = raw.charAt( 0 ) === '-';
		var digits = raw.replace( /[^0-9]/g, '' ) || '0';
		while ( digits.length <= unit ) {
			digits = '0' + digits;
		}
		var whole = unit ? digits.slice( 0, digits.length - unit ) : digits;
		var fraction = unit ? digits.slice( digits.length - unit ) : '';
		whole = whole.replace( /^0+(?=\d)/, '' );
		var sep = c.currency_thousand_separator === undefined ? ',' : c.currency_thousand_separator;
		whole = whole.replace( /\B(?=(\d{3})+(?!\d))/g, sep );
		var number = whole + ( unit ? ( c.currency_decimal_separator || '.' ) + fraction : '' );
		var isZero = /^0*$/.test( digits );
		return ( negative && ! isZero ? '-' : '' ) + ( c.currency_prefix || '' ) + number + ( c.currency_suffix || '' );
	}

	/**
	 * Price text for a Store API product: { text, regular, onSale, range }.
	 */
	function priceParts( prices ) {
		if ( ! prices ) {
			return { text: '', regular: '', onSale: false, range: false };
		}
		var range = prices.price_range && prices.price_range.min_amount !== prices.price_range.max_amount;
		if ( range ) {
			return {
				text: formatMoney( prices.price_range.min_amount, prices ) + ' – ' + formatMoney( prices.price_range.max_amount, prices ),
				regular: '',
				onSale: false,
				range: true
			};
		}
		var onSale = !! prices.sale_price && !! prices.regular_price && prices.sale_price !== prices.regular_price;
		return {
			text: prices.price === '' || prices.price === undefined ? '' : formatMoney( prices.price, prices ),
			regular: onSale ? formatMoney( prices.regular_price, prices ) : '',
			onSale: onSale,
			range: false
		};
	}

	/* ------------------------------------------------------------------ */
	/* Variations                                                           */
	/* ------------------------------------------------------------------ */

	/** Attributes the shopper must choose (Store API attributes with has_variations). */
	function variationAttributes( product ) {
		return ( product && product.attributes || [] ).filter( function ( a ) {
			return a.has_variations;
		} );
	}

	function valueOf( variation, name ) {
		var hit = ( variation.attributes || [] ).filter( function ( a ) {
			return a.name === name;
		} )[ 0 ];
		// "Any value" arrives as "" or null depending on the WooCommerce version.
		return hit && hit.value !== null && hit.value !== undefined ? String( hit.value ) : '';
	}

	/** Every required attribute has a value. */
	function selectionComplete( product, selected ) {
		return variationAttributes( product ).every( function ( a ) {
			return !! ( selected && selected[ a.name ] );
		} );
	}

	/**
	 * The variation for a complete selection, or null. "" (or null) on a variation means "any value".
	 * When several match, the one with the most exact (non-wildcard) values wins, so a
	 * specific variation beats a catch-all one.
	 */
	function matchVariation( product, selected ) {
		if ( ! selectionComplete( product, selected ) ) {
			return null;
		}
		var attrs = variationAttributes( product );
		var best = null;
		var bestScore = -1;
		( product.variations || [] ).forEach( function ( v ) {
			var score = 0;
			var ok = attrs.every( function ( a ) {
				var value = valueOf( v, a.name );
				if ( value === '' ) {
					return true;
				}
				if ( value === selected[ a.name ] ) {
					score++;
					return true;
				}
				return false;
			} );
			if ( ok && score > bestScore ) {
				best = v;
				bestScore = score;
			}
		} );
		return best;
	}

	/**
	 * Values of one attribute that still lead to some variation, given the shopper's other
	 * choices (like WooCommerce's variation form greys out impossible options).
	 */
	function availableValues( product, name, selected ) {
		var attrs = variationAttributes( product );
		var attr = attrs.filter( function ( a ) {
			return a.name === name;
		} )[ 0 ];
		if ( ! attr ) {
			return [];
		}
		return ( attr.terms || [] ).map( function ( term ) {
			return term.slug;
		} ).filter( function ( slug ) {
			return ( product.variations || [] ).some( function ( v ) {
				return attrs.every( function ( a ) {
					var value = valueOf( v, a.name );
					var want = a.name === name ? slug : ( selected && selected[ a.name ] );
					return value === '' || ! want || value === want;
				} );
			} );
		} );
	}

	/**
	 * Store API add-item `variation` payload: every required attribute with the shopper's value
	 * (a wildcard variation still needs the chosen value).
	 */
	function variationPayload( product, selected ) {
		return variationAttributes( product ).map( function ( a ) {
			return { attribute: a.name, value: selected[ a.name ] };
		} );
	}

	/** Selection that matches a variation's fixed values (wildcards keep the current choice). */
	function selectionFor( product, variation, current ) {
		var out = {};
		variationAttributes( product ).forEach( function ( a ) {
			var value = valueOf( variation, a.name );
			out[ a.name ] = value !== '' ? value : ( current && current[ a.name ] ) || '';
		} );
		return out;
	}

	/* ------------------------------------------------------------------ */
	/* Cart helpers                                                         */
	/* ------------------------------------------------------------------ */

	/** Total units in the cart (not distinct lines). */
	function cartUnits( cart ) {
		if ( ! cart ) {
			return 0;
		}
		if ( typeof cart.items_count === 'number' ) {
			return cart.items_count;
		}
		return ( cart.items || [] ).reduce( function ( sum, item ) {
			return sum + ( parseInt( item.quantity, 10 ) || 0 );
		}, 0 );
	}

	/** Units of one product/variation id across all its lines. */
	function quantityOf( cart, itemId ) {
		return ( cart && cart.items || [] ).reduce( function ( sum, item ) {
			return sum + ( item.id === itemId ? ( parseInt( item.quantity, 10 ) || 0 ) : 0 );
		}, 0 );
	}

	/**
	 * After an add whose response was lost: did the server apply it? Compares the item's units
	 * before and after. Only "applied" is trusted; anything else must not be retried blindly.
	 */
	function reconcileAdd( before, after, itemId, quantity ) {
		return quantityOf( after, itemId ) >= quantityOf( before, itemId ) + quantity ? 'applied' : 'not_applied';
	}

	/* ------------------------------------------------------------------ */
	/* Cart store                                                           */
	/* ------------------------------------------------------------------ */

	var NONCE_ERRORS = [ 'woocommerce_rest_invalid_nonce', 'woocommerce_rest_missing_nonce' ];

	function CartError( message, code, status ) {
		var err = new Error( message );
		err.code = code || 'error';
		err.status = status || 0;
		return err;
	}

	/**
	 * Every cart call (reads included) runs through one queue, so responses are applied in
	 * the order the calls were made and a slow, older response can never overwrite a newer
	 * cart. Writes carry the Store API Nonce, refreshed from every response.
	 *
	 * options: { root, fetch, timeout, onChange( cart ), onBusy( busy ), messages: { network, uncertain } }
	 */
	function CartStore( options ) {
		this.root = options.root;
		this.fetchImpl = options.fetch;
		this.timeout = options.timeout || 20000;
		this.onChange = options.onChange || function () {};
		this.onBusy = options.onBusy || function () {};
		this.messages = options.messages || {};
		this.cart = null;
		this.nonce = '';
		this.queue = Promise.resolve();
		this.pendingCount = 0;
		this.inflight = {};
	}

	CartStore.prototype.request = function ( method, path, body ) {
		var self = this;
		var headers = { Accept: 'application/json' };
		if ( method !== 'GET' ) {
			headers[ 'Content-Type' ] = 'application/json';
			if ( self.nonce ) {
				headers.Nonce = self.nonce;
			}
		}
		var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
		var timer = controller ? setTimeout( function () {
			controller.abort();
		}, self.timeout ) : null;

		return self.fetchImpl( restUrl( self.root, path ), {
			method: method,
			credentials: 'same-origin',
			headers: headers,
			body: body ? JSON.stringify( body ) : undefined,
			signal: controller ? controller.signal : undefined
		} ).then( function ( res ) {
			if ( timer ) {
				clearTimeout( timer );
			}
			var nonce = res.headers && res.headers.get ? res.headers.get( 'Nonce' ) : null;
			if ( nonce ) {
				self.nonce = nonce;
			}
			return res.json().catch( function () {
				return null;
			} ).then( function ( json ) {
				if ( ! res.ok ) {
					if ( res.status >= 500 || ! json ) {
						// A server error after the request arrived: the cart may or may not have changed.
						throw CartError( self.messages.network || 'Network error', 'ambiguous', res.status );
					}
					throw CartError( json.message || self.messages.network || 'Error', json.code || 'error', res.status );
				}
				return json;
			} );
		}, function () {
			if ( timer ) {
				clearTimeout( timer );
			}
			// Offline, aborted or timed out: the request may have reached the server.
			throw CartError( self.messages.network || 'Network error', 'ambiguous', 0 );
		} );
	};

	/** Run a task after every earlier one; the queue continues even when a task fails. */
	CartStore.prototype.enqueue = function ( task ) {
		var self = this;
		self.pendingCount++;
		self.onBusy( true );
		var run = self.queue.then( task );
		self.queue = run.catch( function () {} ).then( function () {
			self.pendingCount--;
			if ( ! self.pendingCount ) {
				self.onBusy( false );
			}
		} );
		return run;
	};

	CartStore.prototype.apply = function ( cart ) {
		if ( cart && Array.isArray( cart.items ) ) {
			this.cart = cart;
			this.onChange( cart );
		}
		return this.cart;
	};

	CartStore.prototype.fetchCart = function () {
		var self = this;
		return self.request( 'GET', 'cart' ).then( function ( cart ) {
			return self.apply( cart );
		} );
	};

	/** Read the real cart (also refreshes the nonce). Concurrent loads share one request. */
	CartStore.prototype.load = function () {
		var self = this;
		if ( self.inflight.load ) {
			return self.inflight.load;
		}
		var promise = self.enqueue( function () {
			return self.fetchCart();
		} );
		self.inflight.load = promise;
		var clear = function () {
			if ( self.inflight.load === promise ) {
				delete self.inflight.load;
			}
		};
		promise.then( clear, clear );
		return promise;
	};

	/** A write, retried once when the only problem was an expired or missing nonce. */
	CartStore.prototype.write = function ( path, body ) {
		var self = this;
		var attempt = function () {
			return self.request( 'POST', path, body );
		};
		var first = self.nonce ? attempt() : self.fetchCart().then( attempt );
		return first.catch( function ( err ) {
			if ( NONCE_ERRORS.indexOf( err.code ) !== -1 ) {
				// Refused before the cart was touched, so one retry cannot duplicate anything.
				return self.fetchCart().then( attempt );
			}
			throw err;
		} );
	};

	/**
	 * Add to the cart. payload = { id, quantity, variation? }; itemId is the product or
	 * variation id the line will carry. A second add of the same thing while the first is
	 * still running returns the first one's promise (double-click guard).
	 */
	CartStore.prototype.add = function ( payload, itemId ) {
		var self = this;
		var key = 'add:' + itemId + ':' + JSON.stringify( payload.variation || [] );
		if ( self.inflight[ key ] ) {
			return self.inflight[ key ];
		}
		var promise = self.enqueue( function () {
			// The "before" snapshot must be real for reconciliation, so read the cart first if needed.
			return ( self.cart && self.nonce ? Promise.resolve() : self.fetchCart() ).then( function () {
				return self.addNow( payload, itemId );
			} );
		} );
		self.inflight[ key ] = promise;
		var clear = function () {
			delete self.inflight[ key ];
		};
		promise.then( clear, clear );
		return promise;
	};

	CartStore.prototype.addNow = function ( payload, itemId ) {
		var self = this;
		var before = self.cart;
		return self.write( 'cart/add-item', payload ).then( function ( cart ) {
			return self.apply( cart );
		}, function ( err ) {
			if ( err.code !== 'ambiguous' ) {
				throw err;
			}
			// Never retry an add blindly: ask the server what happened first.
			return self.fetchCart().then( function ( after ) {
				if ( before && reconcileAdd( before, after, itemId, payload.quantity ) === 'applied' ) {
					return after;
				}
				throw CartError( self.messages.notAdded || 'Not added', 'not_added', 0 );
			}, function () {
				throw CartError( self.messages.uncertain || 'Unknown', 'uncertain', 0 );
			} );
		} );
	};

	/** Set a line's quantity (absolute, so a repeat is harmless). */
	CartStore.prototype.update = function ( key, quantity ) {
		var self = this;
		return self.enqueue( function () {
			return self.write( 'cart/update-item', { key: key, quantity: quantity } ).then( function ( cart ) {
				return self.apply( cart );
			}, function ( err ) {
				return self.fetchCart().catch( function () {} ).then( function () {
					throw err;
				} );
			} );
		} );
	};

	/** Remove a line by its cart item key. */
	CartStore.prototype.remove = function ( key ) {
		var self = this;
		return self.enqueue( function () {
			return self.write( 'cart/remove-item', { key: key } ).then( function ( cart ) {
				return self.apply( cart );
			}, function ( err ) {
				return self.fetchCart().catch( function () {} ).then( function () {
					throw err;
				} );
			} );
		} );
	};

	CartStore.prototype.busy = function () {
		return this.pendingCount > 0;
	};

	/** Resolves once every queued call has finished. */
	CartStore.prototype.idle = function () {
		var self = this;
		return self.queue.then( function () {
			return self.pendingCount ? self.idle() : self.cart;
		} );
	};

	/* ------------------------------------------------------------------ */
	/* Logo                                                                 */
	/* ------------------------------------------------------------------ */

	/**
	 * The store logo an add-on put in the page config ({ url, width, height }), or null.
	 * Only an http(s) picture URL is accepted; width and height are its pixel size.
	 */
	function logoSource( logo ) {
		if ( ! logo || typeof logo !== 'object' || typeof logo.url !== 'string' || ! /^https?:\/\/[^\s"'<>]+$/i.test( logo.url ) ) {
			return null;
		}
		var w = Math.round( Number( logo.width ) );
		var h = Math.round( Number( logo.height ) );
		if ( ! ( w > 0 && h > 0 && w <= 8192 && h <= 8192 ) ) {
			return null;
		}
		return { url: logo.url, width: w, height: h };
	}

	return {
		logoSource: logoSource,
		restUrl: restUrl,
		formatMoney: formatMoney,
		priceParts: priceParts,
		variationAttributes: variationAttributes,
		selectionComplete: selectionComplete,
		matchVariation: matchVariation,
		availableValues: availableValues,
		variationPayload: variationPayload,
		selectionFor: selectionFor,
		cartUnits: cartUnits,
		quantityOf: quantityOf,
		reconcileAdd: reconcileAdd,
		CartStore: CartStore
	};
} ) );
