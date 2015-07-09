import request, { Response } from 'dojo-core/request';
import * as lang from 'dojo-core/lang';
import * as arrayUtil from 'dojo-core/array';
import Filter from './Filter';
import * as dstore from './interfaces';
import QueryResults from './QueryResults';
import Store, { NewableStoreModel } from './Store';

var push = [].push;

export interface RequestStoreArgs {
	target?: string;
	headers?: {};
	Model?: NewableStoreModel;
	parse?: () => any;
}


export default class Request<T> extends Store<T> implements dstore.Collection<T> {

	// _targetContainsQueryString: Boolean
	//		A flag indicating whether the target contains a query string
	protected _targetContainsQueryString: boolean;

	// accepts: String
	//		Defines the Accept header to use on HTTP requests
	accepts: string;

	// ascendingPrefix: String
	//		The prefix to apply to sort property names that are ascending
	ascendingPrefix: string;

	// descendingPrefix: String
	//		The prefix to apply to sort property names that are ascending
	descendingPrefix: string;

	// headers: Object
	//		Additional headers to pass in all requests to the server. These can be overridden
	//		by passing additional headers to calls to the store.
	headers: {};

	// rangeStartParam: String
	//		The indicates if range limits (start and end) should be specified
	//		in a query parameter, and what the start parameter should be.
	//		This must be used in conjunction with the rangeCountParam
	//		If this is not specified, the range will
	//		included with a RQL style limit() parameter
	rangeStartParam: string;

	// rangeCountParam: String
	//		The indicates if range limits (start and end) should be specified
	//		in a query parameter, and what the count parameter should be.
	//		This must be used in conjunction with the rangeStartParam
	//		If this is not specified, the range will
	//		included with a RQL style limit() parameter
	rangeCountParam: string;

	// selectParam: String
	//		This will specify the query parameter to use for specifying the
	// 		'select` properties. This will default to `select(<properties>)`
	// 		in the query string.
	selectParam: string;

	// sortParam: String
	//		The query parameter to used for holding sort information. If this is omitted, than
	//		the sort information is included in a functional query token to avoid colliding
	//		with the set of name/value pairs.
	sortParam: string;

	// target: String
	//		The target base URL to use for all requests to the server. This string will be
	//		prepended to the id to generate the URL (relative or absolute) for requests
	//		sent to the server
	target: string;

	// useRangeHeaders: Boolean
	//		The indicates if range limits (start and end) should be specified
	//		a Range header, using items units. If this is set to true, a header
	//		be included of the form:
	//			Range: items=start-end
	useRangeHeaders: boolean;

	// summary:
	//		This is a basic store for RESTful communicating with a server through JSON
	//		formatted data. It extends dstore/Store.
	constructor(options?: RequestStoreArgs) {
		super(options);
		// summary:
		//		This is a basic store for RESTful communicating with a server through JSON
		//		formatted data.
		// options: dstore/JsonRest
		//		This provides any configuration information that will be mixed into the store

		//	Defaults to JSON, but other formats can be parsed by providing an alternate
		//	parsing function. If you do want to use an alternate format, you will probably
		//	want to use an alternate stringify function for the serialization of data as well.
		//	Also, if you want to support parsing a larger set of JavaScript objects
		//	outside of strict JSON parsing, you can provide dojo/_base/json.fromJson as the parse function
		this.parse = this.parse || function (data: string) {
			return JSON.parse(data);
		};
		this.headers || (this.headers = {});
		this.target = this.target || '';
		this._targetContainsQueryString = this.target.lastIndexOf('?') >= 0;
		this.ascendingPrefix = this.ascendingPrefix || '+';
		this.descendingPrefix = this.descendingPrefix || '-';
		this.accepts = this.accepts || 'application/json';
		this.fetch = this.fetch || function (kwArgs?: dstore.FetchArgs) {
			var results = this._request(kwArgs);
			return <dstore.FetchPromise<any>>QueryResults(results.data, {
				response: results.response
			});
		}
	}

	fetchRange(kwArgs: dstore.FetchRangeArgs) {
		var start = kwArgs.start,
			end = kwArgs.end,
			requestArgs: dstore.FetchArgs = {};
		if (this.useRangeHeaders) {
			requestArgs.headers = lang.mixin(this._renderRangeHeaders(start, end), kwArgs.headers);
		} else {
			requestArgs.queryParams = this._renderRangeParams(start, end);
			if (kwArgs.headers) {
				requestArgs.headers = kwArgs.headers;
			}
		}

		var results = this._request(requestArgs);
		return <dstore.FetchPromise<T>>QueryResults(results.data, {
			totalLength: results.total,
			response: results.response
		});
	}

	_request(kwArgs: dstore.FetchArgs) {
		kwArgs = kwArgs || {};

		// perform the actual query
		var headers: { [ name: string ]: string } = <{ [ name: string ]: string }>lang.mixin(Object.create(this.headers), { Accept: this.accepts });

		if ('headers' in kwArgs) {
			lang.mixin(headers, kwArgs.headers);
		}

		var requestUrl = this._renderUrl(kwArgs.queryParams);

		var response = request(requestUrl, {
			method: 'GET',
			headers: headers
		});
		var collection = this;
		var parsedResponse = response.then(function (response: Response<string>) {
			return collection.parse(response.data);
		});
		return {
			data: parsedResponse.then(function (data) {
				// support items in the results
				var results = data.items || data;
				for (var i = 0, l = results.length; i < l; i++) {
					results[i] = collection._restore(results[i], true);
				}
				return results;
			}),
			total: parsedResponse.then(function (data) {
				// check for a total property
				var total = data.total;
				if (total > -1) {
					// if we have a valid positive number from the data,
					// we can use that
					return total;
				}
				// else use headers
				return response.then(function (response) {
					var rangeHeader = response.getHeader('Content-Range');
					let rangeMatch: RegExpMatchArray;
					let range: number;
					if (rangeHeader && (rangeMatch = rangeHeader.match(/\/(.*)/)) && (range = Number(rangeMatch[1]))) {
						return range;
					} else {
						return null;
					}
				});
			}),
			response: response
		};
	}

	_renderFilterParams(filter: Filter) {
		// summary:
		//		Constructs filter-related params to be inserted into the query string
		// returns: String
		//		Filter-related params to be inserted in the query string
		var type = filter.type;
		var args = filter.args;
		if (!type) {
			return [''];
		}
		if (type === 'string') {
			return [args[0]];
		}
		if (type === 'and' || type === 'or') {
			return [filter.args.map(function (arg) {
				// render each of the arguments to and or or, then combine by the right operator
				var renderedArg = this._renderFilterParams(arg);
				return ((arg.type === 'and' || arg.type === 'or') && arg.type !== type) ?
					// need to observe precedence in the case of changing combination operators
					'(' + renderedArg + ')' : renderedArg;
			}, this).join(type === 'and' ? '&' : '|')];
		}
		var target = args[1];
		if (target) {
			if(target._renderUrl) {
				// detected nested query, and render the url inside as an argument
				target = '(' + target._renderUrl() + ')';
			} else if (target instanceof Array) {
				target = '(' + target + ')';
			}
		}
		return [encodeURIComponent(args[0]) + '=' + (type === 'eq' ? '' : type + '=') + encodeURIComponent(target)];
	}

	_renderSortParams(sort: dstore.SortOption[]) {
		// summary:
		//		Constructs sort-related params to be inserted in the query string
		// returns: String
		//		Sort-related params to be inserted in the query string
		var sortString = sort.map(function (sortOption: dstore.SortOption) {
			var prefix = sortOption.descending ? this.descendingPrefix : this.ascendingPrefix;
			return prefix + encodeURIComponent(sortOption.property);
		}, this);

		var params: string[] = [];
		if (sortString) {
			params.push(this.sortParam
				? encodeURIComponent(this.sortParam) + '=' + sortString
				: 'sort(' + sortString + ')'
			);
		}
		return params;
	}

	_renderRangeParams(start: number, end: number) {
		// summary:
		//		Constructs range-related params to be inserted in the query string
		// returns: String
		//		Range-related params to be inserted in the query string
		var params: string[] = [];
		if (this.rangeStartParam) {
			params.push(
				this.rangeStartParam + '=' + start,
				this.rangeCountParam + '=' + (end - start)
			);
		} else {
			params.push('limit(' + (end - start) + (start ? (',' + start) : '') + ')');
		}
		return params;
	}

	_renderSelectParams(properties: string) {
		// summary:
		//		Constructs select-related params to be inserted in the query string
		// returns: String
		//		Select-related params to be inserted in the query string
		var params: string[] = [];
		if (this.selectParam) {
			params.push(this.selectParam + '=' + properties);
		} else {
			params.push('select(' + properties + ')');
		}
		return params;
	}

	_renderQueryParams() {
		var queryParams: Array<string| {}> = [];

		this.queryLog.forEach(function (entry: dstore.QueryLogEntry<any>) {
			var type = entry.type,
				renderMethod = '_render' + type[0].toUpperCase() + type.substr(1) + 'Params';

			if (this[renderMethod]) {
				push.apply(queryParams, this[renderMethod].apply(this, entry.normalizedArguments));
			} else {
				console.warn('Unable to render query params for "' + type + '" query', entry);
			}
		}, this);

		return queryParams;
	}

	_renderUrl(requestParams: string | string[]) {
		// summary:
		//		Constructs the URL used to fetch the data.
		// returns: String
		//		The URL of the data
		var queryParams = this._renderQueryParams(),
			requestUrl = this.target;

		if (requestParams) {
			push.apply(queryParams, requestParams);
		}

		if (queryParams.length > 0) {
			requestUrl += (this._targetContainsQueryString ? '&' : '?') + queryParams.join('&');
		}
		return requestUrl;
	}

	_renderRangeHeaders(start: number, end: number) {
		// summary:
		//		Applies a Range header if this collection incorporates a range query
		// headers: Object
		//		The headers to which a Range property is added
		var value = 'items=' + start + '-' + (end - 1);
		return {
			'Range': value,
			'X-Range': value //set X-Range for Opera since it blocks "Range" header
		};
	}
}
