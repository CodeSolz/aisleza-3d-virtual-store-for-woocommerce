/**
 * Aisleza settings pages: each page's parts are tabs (elements with the class `aisleza-tab` and a
 * `data-tab-label`, add-on cards included), listed on the left; one shows at a time. A link to an
 * element inside a tab opens that tab, and an old link to the single settings page
 * (…page=aisleza#that-part) is sent to the page that holds that part now. Without this script
 * every part shows, one under another.
 */
( function () {
	'use strict';

	document.addEventListener( 'DOMContentLoaded', function () {
		var wrap = document.querySelector( '.aisleza-admin' );
		var nav = document.querySelector( '.aisleza-nav' );
		var main = document.querySelector( '.aisleza-main' );
		if ( ! wrap || ! nav || ! main ) {
			return;
		}
		// An old link whose part now lives on another page: go there, keeping the part.
		var id = decodeURIComponent( window.location.hash.slice( 1 ) );
		var forward = {};
		try {
			forward = JSON.parse( wrap.getAttribute( 'data-forward' ) || '{}' );
		} catch ( e ) {}
		if ( id && ! document.getElementById( id ) && Object.prototype.hasOwnProperty.call( forward, id ) ) {
			window.location.replace( forward[ id ] + '#' + id );
			return;
		}
		var tabs = Array.prototype.slice.call( main.querySelectorAll( '.aisleza-tab' ) );
		if ( tabs.length < 2 ) {
			return; // One part: nothing to choose.
		}
		var cards = Array.prototype.slice.call( main.querySelectorAll( '.aisleza-admin__card' ) );
		var list = document.createElement( 'ul' );
		var links = tabs.map( function ( tab, k ) {
			if ( ! tab.id ) {
				tab.id = 'aisleza-tab-' + k;
			}
			var a = document.createElement( 'a' );
			a.href = '#' + tab.id;
			a.textContent = tab.getAttribute( 'data-tab-label' ) || ( tab.querySelector( 'h2, h3' ) || { textContent: '' } ).textContent.trim();
			a.addEventListener( 'click', function ( e ) {
				e.preventDefault();
				open( tab );
				if ( window.history && window.history.replaceState ) {
					window.history.replaceState( null, '', '#' + tab.id );
				}
				window.scrollTo( { top: 0 } );
			} );
			var li = document.createElement( 'li' );
			li.appendChild( a );
			list.appendChild( li );
			return a;
		} );
		nav.appendChild( list );
		nav.hidden = false;
		document.documentElement.classList.add( 'aisleza-has-nav' );
		wrap.classList.add( 'aisleza-tabbed' );

		/** Show one tab; a card shows when it is that tab, holds it, or holds no tab at all. */
		function open( tab ) {
			tabs.forEach( function ( t, k ) {
				var on = t === tab;
				t.classList.toggle( 'is-tab-hidden', ! on );
				if ( on ) {
					links[ k ].setAttribute( 'aria-current', 'page' );
				} else {
					links[ k ].removeAttribute( 'aria-current' );
				}
			} );
			cards.forEach( function ( card ) {
				if ( card.classList.contains( 'aisleza-tab' ) ) {
					return;
				}
				if ( card.querySelector( '.aisleza-tab' ) ) {
					card.classList.toggle( 'is-tab-hidden', ! card.contains( tab ) );
				}
			} );
			try {
				window.sessionStorage.setItem( 'aisleza-tab:' + wrap.getAttribute( 'data-page' ), tab.id );
			} catch ( e ) {}
		}

		/** The tab holding the element the address points at. */
		function fromHash() {
			var target = document.getElementById( decodeURIComponent( window.location.hash.slice( 1 ) ) );
			return target ? ( target.classList.contains( 'aisleza-tab' ) ? target : target.closest( '.aisleza-tab' ) ) : null;
		}

		var remembered = null;
		try {
			remembered = document.getElementById( window.sessionStorage.getItem( 'aisleza-tab:' + wrap.getAttribute( 'data-page' ) ) || '' );
		} catch ( e ) {}
		// A saved form's message is in its own tab: open that one first.
		var notice = main.querySelector( '.aisleza-tab .notice' );
		var first = fromHash() || ( notice && notice.closest( '.aisleza-tab' ) ) || ( remembered && remembered.classList.contains( 'aisleza-tab' ) ? remembered : null ) || tabs[ 0 ];
		open( first );
		var deep = document.getElementById( decodeURIComponent( window.location.hash.slice( 1 ) ) );
		if ( deep && deep !== first ) {
			deep.scrollIntoView();
		}
		window.addEventListener( 'hashchange', function () {
			var tab = fromHash();
			if ( tab ) {
				open( tab );
				var target = document.getElementById( decodeURIComponent( window.location.hash.slice( 1 ) ) );
				if ( target && target !== tab ) {
					target.scrollIntoView();
				}
			}
		} );
	} );

	/*
	 * Every card has its own form and Save button. A change made in one card is lost if another
	 * card's Save is pressed or the page is left, so mark the changed card ("Unsaved changes" by
	 * its Save) and ask before leaving it behind.
	 */
	document.addEventListener( 'DOMContentLoaded', function () {
		var forms = Array.prototype.slice.call( document.querySelectorAll( '.aisleza-admin__card form' ) );
		var submitting = null;
		var label = ( document.querySelector( '.aisleza-admin' ) || document.body ).getAttribute( 'data-unsaved' ) || '';
		function dirty( form ) {
			if ( form.classList.contains( 'is-dirty' ) ) {
				return;
			}
			form.classList.add( 'is-dirty' );
			var bar = form.querySelector( ':scope > p:last-child' );
			if ( bar && label ) {
				var note = document.createElement( 'span' );
				note.className = 'aisleza-admin__unsaved';
				note.textContent = label;
				bar.appendChild( note );
			}
		}
		forms.forEach( function ( form ) {
			form.addEventListener( 'input', function () {
				dirty( form );
			} );
			form.addEventListener( 'change', function () {
				dirty( form );
			} );
			form.addEventListener( 'click', function ( e ) {
				// Media pickers, Remove / Undo and Add buttons change a card without an input event.
				if ( e.target.closest( '[data-media-choose], [data-media-remove], [data-slot-remove], [data-slot-undo], [data-aisleza-reveal]' ) ) {
					dirty( form );
				}
			} );
			form.addEventListener( 'submit', function () {
				submitting = form;
			} );
		} );
		window.addEventListener( 'beforeunload', function ( e ) {
			var lost = forms.some( function ( form ) {
				return form !== submitting && form.classList.contains( 'is-dirty' );
			} );
			if ( lost ) {
				e.preventDefault();
				e.returnValue = ''; // The browser shows its own "Leave site?" message.
			}
		} );
	} );
}() );
