/**
 * Skin validation. A skin is data only (never code): this checks it before the engine uses it.
 *
 * The allowed shape is the Boutique skin itself: a skin may only use keys Boutique has, and
 * each value must have the same kind as Boutique's (colour, number, switch, name, list).
 * Numbers are clamped to safe ranges, unknown keys and broken values are dropped (Boutique's
 * value then applies), and a skin made for a newer engine is refused as a whole.
 *
 * No imports: the same rules are used by the engine, by the unit tests and (as a PHP port)
 * by the Pro skin installer.
 */

export const ENGINE = 1; // Skin format version this engine understands.

const HEX = /^#[0-9a-f]{6}$/i;
const NAME = /^[a-z0-9-]{1,32}$/; // Style names (looked up at render time; unknown → Boutique).

/** Fixed word lists. */
const ENUMS = {
	'fonts.signs': [ 'serif', 'sans' ]
};

/** Lists of fixed words (order kept, duplicates removed). */
const ENUM_LISTS = {
	'shelfDecor.sets': [ 'vases', 'plant', 'towels', 'basket', 'candles' ]
};

/** Colour lists: [ minimum, maximum ] entries. */
const COLOUR_LISTS = {
	'floor.tones': [ 1, 4 ],
	'floor.clouds': [ 2, 2 ],
	'floor.speckle': [ 1, 8 ],
	'plants.greens': [ 1, 12 ],
	'plants.olive': [ 2, 2 ],
	'outside.trees': [ 1, 6 ]
};

/** Numbers: [ minimum, maximum ]. */
const RANGES = {
	'glow.intensity': [ 0, 2 ],
	'floor.tile': [ 0.3, 3 ],
	'floor.roughness': [ 0, 1 ],
	'lighting.fogNear': [ 1, 200 ],
	'lighting.fogFar': [ 5, 400 ],
	'lighting.exposure': [ 0.3, 2 ],
	'lighting.environment': [ 0, 2 ],
	'lighting.hemisphere': [ 0, 4 ],
	'lighting.ambientIntensity': [ 0, 3 ],
	'lighting.sunIntensity': [ 0, 4 ]
};

/** Identity keys at the top level, each with its own rule. */
const IDENTITY = {
	id: ( v ) => ( typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test( v ) ? v : undefined ),
	name: ( v ) => ( typeof v === 'string' ? v.replace( /[\u0000-\u001f<>]/g, '' ).trim().slice( 0, 60 ) || undefined : undefined ),
	version: ( v ) => ( typeof v === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test( v ) ? v : undefined ),
	engine: ( v ) => ( Number.isInteger( v ) && v >= 1 ? v : undefined )
};

function isObject( v ) {
	return v !== null && typeof v === 'object' && ! Array.isArray( v );
}

/** A table's own entry for key, never an inherited one ("__proto__", "constructor"…). */
function own( table, key ) {
	return Object.prototype.hasOwnProperty.call( table, key ) ? table[ key ] : undefined;
}

/**
 * Check a skin against the Boutique template.
 *
 * Returns { skin, errors }: skin holds only the valid parts (merge it onto Boutique), or is
 * null when the skin can't be used at all (not an object, or made for a newer engine).
 * errors lists what was dropped or changed, as "path: reason".
 */
export function validateSkin( raw, base ) {
	const errors = [];
	if ( ! isObject( raw ) ) {
		return { skin: null, errors: [ 'skin: not an object' ] };
	}
	if ( raw.engine !== undefined && Number.isInteger( raw.engine ) && raw.engine > ENGINE ) {
		return { skin: null, errors: [ 'engine: needs engine ' + raw.engine + ', this is ' + ENGINE ] };
	}
	const skin = {};
	Object.keys( raw ).forEach( ( key ) => {
		const rule = own( IDENTITY, key );
		if ( rule ) {
			const v = rule( raw[ key ] );
			if ( v === undefined ) {
				errors.push( key + ': invalid' );
			} else {
				skin[ key ] = v;
			}
			return;
		}
		if ( ! Object.prototype.hasOwnProperty.call( base, key ) ) {
			errors.push( key + ': unknown key' );
			return;
		}
		const v = check( raw[ key ], base[ key ], key, errors );
		if ( v !== undefined ) {
			skin[ key ] = v;
		}
	} );
	// Fog must end after it starts; otherwise keep Boutique's fog.
	const fog = skin.lighting;
	if ( fog && ( fog.fogNear !== undefined || fog.fogFar !== undefined ) ) {
		const near = fog.fogNear !== undefined ? fog.fogNear : base.lighting.fogNear;
		const far = fog.fogFar !== undefined ? fog.fogFar : base.lighting.fogFar;
		if ( far <= near ) {
			delete fog.fogNear;
			delete fog.fogFar;
			errors.push( 'lighting.fogFar: must be greater than fogNear' );
			if ( ! Object.keys( fog ).length ) {
				delete skin.lighting;
			}
		}
	}
	return { skin, errors };
}

/** One value against the template value at the same path. undefined = drop it. */
function check( value, template, path, errors ) {
	const bad = ( reason ) => {
		errors.push( path + ': ' + reason );
		return undefined;
	};

	if ( isObject( template ) ) {
		if ( ! isObject( value ) ) {
			return bad( 'expected a group of settings' );
		}
		const out = {};
		Object.keys( value ).forEach( ( key ) => {
			if ( ! Object.prototype.hasOwnProperty.call( template, key ) ) {
				errors.push( path + '.' + key + ': unknown key' );
				return;
			}
			const v = check( value[ key ], template[ key ], path + '.' + key, errors );
			if ( v !== undefined ) {
				out[ key ] = v;
			}
		} );
		return Object.keys( out ).length ? out : undefined; // An empty group carries nothing.
	}

	const allowed = own( ENUM_LISTS, path );
	if ( allowed ) {
		if ( ! Array.isArray( value ) ) {
			return bad( 'expected a list' );
		}
		const out = [];
		value.forEach( ( item ) => {
			if ( allowed.includes( item ) && ! out.includes( item ) ) {
				out.push( item );
			} else {
				errors.push( path + ': dropped "' + String( item ).slice( 0, 32 ) + '"' );
			}
		} );
		return out; // An empty list is allowed: no shelf decor.
	}

	const bounds = own( COLOUR_LISTS, path );
	if ( bounds ) {
		if ( ! Array.isArray( value ) ) {
			return bad( 'expected a list of colours' );
		}
		const [ min, max ] = bounds;
		const out = value.filter( ( c ) => typeof c === 'string' && HEX.test( c ) ).map( ( c ) => c.toLowerCase() ).slice( 0, max );
		if ( out.length < value.length ) {
			errors.push( path + ': dropped invalid or extra colours' );
		}
		return out.length >= min ? out : bad( 'needs at least ' + min + ' colour(s)' );
	}

	if ( typeof template === 'string' && HEX.test( template ) ) {
		return typeof value === 'string' && HEX.test( value ) ? value.toLowerCase() : bad( 'expected a #rrggbb colour' );
	}

	const words = own( ENUMS, path );
	if ( words ) {
		return words.includes( value ) ? value : bad( 'expected one of ' + words.join( ', ' ) );
	}

	if ( typeof template === 'string' ) {
		// Style names: a plain lowercase name; whether it exists is decided when drawing.
		return typeof value === 'string' && NAME.test( value ) ? value : bad( 'expected a style name' );
	}

	if ( typeof template === 'number' ) {
		if ( typeof value !== 'number' || ! Number.isFinite( value ) ) {
			return bad( 'expected a number' );
		}
		const range = own( RANGES, path );
		if ( ! range ) {
			return bad( 'no range defined' );
		}
		const clamped = Math.min( range[ 1 ], Math.max( range[ 0 ], value ) );
		if ( clamped !== value ) {
			errors.push( path + ': clamped to ' + clamped );
		}
		return clamped;
	}

	if ( typeof template === 'boolean' ) {
		return typeof value === 'boolean' ? value : bad( 'expected true or false' );
	}

	return bad( 'unsupported value' );
}
