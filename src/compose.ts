import { assign } from 'dojo-core/lang';
import WeakMap from 'dojo-core/WeakMap';
interface Symbol {
	toString(): string;
	valueOf(): Object;
	[Symbol.toStringTag]: string;
}

interface SymbolConstructor {
	prototype: Symbol;
	(description?: string|number): symbol;
	for(key: string): symbol;
	keyFor(sym: symbol): string;
	hasInstance: symbol;
	isConcatSpreadable: symbol;
	iterator: symbol;
	match: symbol;
	replace: symbol;
	search: symbol;
	species: symbol;
	split: symbol;
	toPrimitive: symbol;
	toStringTag: symbol;
	unscopables: symbol;
}
declare var Symbol: SymbolConstructor;

interface IteratorResult<T> {
	done: boolean;
	value?: T;
}

interface Iterator<T> {
	next(value?: any): IteratorResult<T>;
	return?(value?: any): IteratorResult<T>;
	throw?(e?: any): IteratorResult<T>;
}

interface Iterable<T> {
	[Symbol.iterator](): Iterator<T>;
}

/* Used for mapping the init functions */
const initFnMap = new WeakMap<Function, Function[]>();

/**
 * We need to rebase some functions where the first argument is scoped to be
 * this. .bind() ends up creating a lot of new functions and actually we want
 * to keep it simple and efficient.
 * @param  {Function} fn The function be rebased
 * @return {Function}    The rebased function
 */
function rebase(fn: Function): Function {
	return function(...args: any[]) {
		return fn.apply(this, [ this ].concat(args));
	};
}

/* These rabased functions are used to decorate the constructors */
const doExtend = rebase(extend);
const doMixin = rebase(mixin);
const doOverlay = rebase(overlay);

/**
 * Apply the rebased functions
 * @param {any} base The item to be decorated
 */
function stamp(base: any): void {
	base.extend = doExtend;
	base.mixin = doMixin;
	base.overlay = doOverlay;
}

/**
 * Generic Class Constructor API with a Generic for type inference
 */
export interface GenericClass<T> {
	new (...args: any[]): T;
}

/**
 * Compose constructor API
 */
export interface ComposerClass<O, T> {
	new (options?: O): T;

	/* Extensions are objects who's enumerable own properties will be mixed
	 * into the class */
	extend<U>(extension: U): ComposerClass<O, T&U>;

	/* Either compose constructors or generic constructors cann be mixed into
	 * the classes */
	mixin<P, U>(mixin: ComposerClass<P, U>): ComposerClass<O&P, T&U>;
	mixin<P, U>(mixin: GenericClass<U>): ComposerClass<O, T&U>;

	/* Overlay functions will be passed the prototype which the can modify
	 * decorate */
	overlay(overlay: (proto: T) => void): ComposerClass<O, T>;
}

/**
 * Compose initialisation function API
 */
export interface ComposerFunction<O> {
	(options?: O): void;
}

/**
 * The composistion library API
 */
export interface Composer {
	<O, A>(superClass: GenericClass<A>, initFunction?: ComposerFunction<O>): ComposerClass<O, A>;
	<O, A, P>(superClass: ComposerClass<O, A>, initFunction?: ComposerFunction<P>): ComposerClass<O&P, A>;
	<O, A>(superClass: A, initFunction?: ComposerFunction<O>): ComposerClass<O, A>;
	create<O, A>(superClass: GenericClass<A>, initFunction?: ComposerFunction<O>): ComposerClass<O, A>;
	create<O, A, P>(superClass: ComposerClass<O, A>, initFunction?: ComposerFunction<P>): ComposerClass<O&P, A>;
	create<O, A>(superClass: A, initFunction?: ComposerFunction<O>): ComposerClass<O, A>;
	extend<O, A, B>(base: ComposerClass<O, A>, extension: B): ComposerClass<O, A&B>;
	mixin<O, P, A, B>(base: ComposerClass<O, A>, mixin: ComposerClass<P, B>): ComposerClass<O&P, A&B>;
	mixin<O, A, B>(base: ComposerClass<O, A>, mixin: GenericClass<B>): ComposerClass<O, A&B>;
	overlay<O, A>(base: ComposerClass<O, A>, overlay: (proto: A) => void): ComposerClass<O, A>;
}

/**
 * Helper function that returns a new function and a new reference to a prototype
 */
function cloneCreator<O, T>(base?: ComposerClass<O, T>): ComposerClass<O, T>;
function cloneCreator(base?: any): any {
	function Creator(...args: any[]): any {
		const initFns = initFnMap.get(this.constructor);
		if (initFns) {
			initFns.forEach(fn => fn.apply(this, args));
		}
	}

	if (base) {
		assign(Creator.prototype, base.prototype);
		initFnMap.set(Creator, [].concat(initFnMap.get(base)));
	}
	else {
		initFnMap.set(Creator, []);
	}
	Creator.prototype.constructor = Creator;
	stamp(Creator);

	return Creator;
}

/**
 * Extend a compose constructor
 */
function extend<O, A, B>(base: ComposerClass<O, A>, extension: B): ComposerClass<O, A&B>;
function extend<O>(base: ComposerClass<O, any>, extension: any): ComposerClass<O, any> {
	base = cloneCreator(base);
	Object.keys(extension).forEach(key => base.prototype[key] = extension[key]);
	return base;
}

/**
 * Mixin to a compose constructor
 */
function mixin<O, P, A, B>(base: ComposerClass<O, A>, mixin: ComposerClass<P, B>): ComposerClass<O&P, A&B>;
function mixin<O, A, B>(base: ComposerClass<O, A>, mixin: GenericClass<B>): ComposerClass<O, A&B>;
function mixin<O>(base: ComposerClass<O, any>, mixin: any): ComposerClass<O, any> {
	base = cloneCreator(base);
	Object.keys(mixin.prototype).forEach(key => base.prototype[key] = mixin.prototype[key]);
	return base;
}

/**
 * Allow a function to overlay the prototype of a composer class
 */
function overlay<O, A>(base: ComposerClass<O, A>, overlay: (proto: A) => void): ComposerClass<O, A> {
	base = cloneCreator(base);
	overlay(base.prototype);
	return base;
}

/**
 * Create a new compose constructor based on a generic constructor, a composer constructor
 * or just a "prototype" object.
 */
function create<O, A>(base: GenericClass<A>, initFunction?: ComposerFunction<O>): ComposerClass<O, A>;
function create<O, A, P>(base: ComposerClass<O, A>, initFunction?: ComposerFunction<P>): ComposerClass<O&P, A>;
function create<O, A>(base: A, initFunction?: ComposerFunction<O>): ComposerClass<O, A>;
function create<O>(base: any, initFunction?: ComposerFunction<O>): any {
	const Creator = cloneCreator();
	if (initFunction) {
		initFnMap.get(Creator).push(initFunction);
	}

	/* mixin the base into the prototype */
	assign(Creator.prototype, typeof base === 'function' ? base.prototype : base);

	/* return the new constructor */
	return Creator;
}

/* decorating the compose function */
(<Composer> create).create = create;
(<Composer> create).extend = extend;
(<Composer> create).mixin = mixin;
(<Composer> create).overlay = overlay;

/* Let's coerce it to the API */
const compose: Composer = <Composer> create;
export default compose;

