import * as lang from 'dojo-core/lang';
import Promise from 'dojo-core/Promise';
import request from 'dojo-core/request';
import * as dstore from './interfaces';
import Request, { RequestStoreArgs } from './Request'; /*========, './Store' =========*/
import { NewableStoreModel } from './Store';

/*=====
 var __HeaderOptions = {
 // headers: Object?
 //		Additional headers to send along with the request.
 },
 __PutDirectives = declare(Store.PutDirectives, __HeaderOptions),
 =====*/
export default class Rest<T> extends Request<T> implements dstore.Collection<T> {

	defaultNewToStart: boolean;

	// stringify: Function
	//		This function performs the serialization of the data for requests to the server. This
	//		defaults to JSON, but other formats can be serialized by providing an alternate
	//		stringify function. If you do want to use an alternate format, you will probably
	//		want to use an alternate parse function for the parsing of data as well.
	stringify: (...args: any[]) => string;

	constructor(args: RequestStoreArgs) {
		this.autoEmitEvents = false;
		this.stringify = JSON.stringify;
		this.get = function (id, options) {
			options = options || {};
			var headers = <{ [ name: string ]: string }>lang.mixin({ Accept: this.accepts }, this.headers, options['headers'] || options);
			var store = this;
			return request(this._getTarget(id), {
				headers: headers
			}).then(function (response) {
				return store._restore(store.parse(response), true);
			});
		};
		this.put = function(object, options) {
			options = options || <dstore.PutDirectives>{};
			var id = ('id' in options) ? options.id : this.getIdentity(object);
			var hasId = typeof id !== 'undefined';
			var store = this;

			var positionHeaders = 'beforeId' in options
				? (options.beforeId === null
				? { 'Put-Default-Position': 'end' }
				: { 'Put-Before': options.beforeId })
				: (!hasId || options.overwrite === false
				? { 'Put-Default-Position': (this.defaultNewToStart ? 'start' : 'end') }
				: null);

			var initialResponse = request(hasId ? this._getTarget(id) : this.target, {
				method: hasId && !options.incremental ? 'PUT' : 'POST',
				data: this.stringify(object),
				headers: <{ [ name: string ]: any }>lang.mixin({
					'Content-Type': 'application/json',
					Accept: this.accepts,
					'If-Match': options.overwrite === true ? '*' : null,
					'If-None-Match': options.overwrite === false ? '*' : null
				}, positionHeaders, this.headers, options.headers)
			});
			return initialResponse.then(function (response) {
				var event = <{ beforeId?: string | number, target?: T }>{};

				if ('beforeId' in options) {
					event.beforeId = options.beforeId;
				}

				var result = event.target = response && store._restore(store.parse(response), true) || object;

				store._emit(response.statusCode === 201 ? 'add' : 'update', event);

				return result;
			});
		};
		this.add = function (object, options) {
			// summary:
			//		Adds an object. This will trigger a PUT request to the server
			//		if the object has an id, otherwise it will trigger a POST request.
			// object: Object
			//		The object to store.
			// options: __PutDirectives?
			//		Additional metadata for storing the data.  Includes an 'id'
			//		property if a specific id is to be used.
			options = options || {};
			options.overwrite = false;
			return this.put(object, options);
		};
		this.remove = function (id: any, options?: { [ name: string ]: any }) {
			// summary:
			//		Deletes an object by its identity. This will trigger a DELETE request to the server.
			// id: Number
			//		The identity to use to delete the object
			// options: __HeaderOptions?
			//		HTTP headers.
			options = options || {};
			var store = this;
			return request(this._getTarget(id), {
				method: 'DELETE',
				headers: <{ [ name: string ]: any }>lang.mixin({}, this.headers, options['headers'])
			}).then(function (response) {
				var target = response && store.parse(response);
				store._emit('delete', { id: id, target: target });
				return response ? target : true;
			});
		};
		super(args);
		if (!this.autoEmitEvents) {
			this.autoEmitHandles.forEach(function (handle) {
				handle.destroy();
			});
		}
	}

	_getTarget(id: string): string {
		// summary:
		//		If the target has no trailing '/', then append it.
		// id:
		//		The identity of the requested target
		var target = this.target;
		if (target.slice(-1) == '/') {
			return target + id;
		} else {
			return target + '/' + id;
		}
	}

	// summary:
	//		Retrieves an object by its identity. This will trigger a GET request to the server using
	//		the url `this.target + id`.
	// id: Number
	//		The identity to use to lookup the object
	// options: Object?
	//		HTTP headers. For consistency with other methods, if a `headers` key exists on this
	//		object, it will be used to provide HTTP headers instead.
	// returns: Object
	//		The object in the store that matches the given id.
	get: (id: string | number, options?: { [ name: string ]: any }) => Promise<T>;
	// this is handled by the methods themselves
	autoEmitEvents: boolean;
}
