import { Handle, Hash } from 'dojo-core/interfaces';
import * as lang from 'dojo-core/lang';
import Promise from 'dojo-core/Promise';
import request, { providerRegistry, RequestOptions } from 'dojo-core/request';
import UrlSearchParams from 'dojo-core/UrlSearchParams';
import registerSuite = require('intern!object');
import assert = require('intern/chai!assert');
import * as dstore from 'src/interfaces';
import Request, { RequestStoreArgs } from 'src/Request';
import * as mockRequestProvider from './mockRequestProvider';

class Model {
	constructor(args?: {}) {
		lang.mixin(this, {
			_restore: function (Constructor: { new (arg: any): { restored: boolean } }) {
				// use constructor based restoration
				const restored = new Constructor(this);
				restored.restored = true;
				return restored;
			},
			createSubclass: null
		}, args);
	}

	_restore(Constructor: { new (arg: any): { restored: boolean } }) {
		// use constructor based restoration
		const restored = new Constructor(this);
		restored.restored = true;
		return restored;
	}

	name: string;

	describe() {
		return 'name is ' + this.name;
	}
}


class ConcreteRequest<T> extends Request<T> {
	add(object: any, directives?: dstore.PutDirectives):  any {
		throw new Error('This Method is abstract');
	}

	put(object: T, directives?: dstore.PutDirectives):  Promise<T> {
		return new Promise(function (resolve) {
			resolve(object)
		});
	}

	get(id: string | number): Promise<T> | void {
		throw new Error('This Method is abstract');
	}

	remove(id: any): Promise<T | void> {
		throw new Error('This Method is abstract');
	}
}

let store: ConcreteRequest<any>;

const globalHeaders: { [ name: string ]: string } = {

	'test-global-header-a': 'true',
	'test-global-header-b': 'yes'
};
const requestHeaders: { [ name: string ]: string } = {
	'test-local-header-a': 'true',
	'test-local-header-b': 'yes',
	'test-override': 'overridden'
};

function runCollectionTest<T>(collection: dstore.Collection<T>, rangeArgs: dstore.FetchRangeArgs | RequestOptions, expected?: RequestOptions) {
	const expectedResults: { [ name: string ]: number | string }[] = [
		{ id: 1, name: 'one' },
		{ id: 2, name: 'two' }
	];
	mockRequestProvider.setResponseText(JSON.stringify(expectedResults));
	let resultsPromise: dstore.FetchPromise<any>;
	if (!expected) {
		expected = <RequestOptions> rangeArgs;
		resultsPromise = collection.fetch();
	}
	else {
		const { start, end } = <dstore.FetchRangeArgs> rangeArgs;
		mockRequestProvider.setResponseHeaders({
			'Content-Range': start + '-' + end + '/' + expectedResults.length
		});
		resultsPromise = collection.fetchRange(<dstore.FetchRangeArgs> rangeArgs);
	}
	return resultsPromise.then(function (results) {
		expected.headers && mockRequestProvider.assertRequestHeaders(expected.headers);
		expected.query && mockRequestProvider.assertQuery(new UrlSearchParams(expected.query));

		// We cannot just assert deepEqual with results and expectedResults
		// because the store converts results into model instances with additional members.
		assert.strictEqual(results.length, expectedResults.length);
		for (let i = 0; i < results.length; ++i) {
			const result: { [ name: string ]: number | string } = results[i];
			const expectedResult: { [ name: string ]: number | string } = expectedResults[i];
			for (let key in expectedResult) {
				assert.strictEqual(result[key], expectedResult[key]);
			}
		}
		if (resultsPromise.totalLength instanceof Promise) {
			return (<Promise<number>> resultsPromise.totalLength).then(function (totalLength) {
				assert.strictEqual(totalLength, expectedResults.length);
			});
		}
	});
}

let registryHandle: Handle;
let treeTestRootData: string;
function createRequestTests(Store: new (options?: RequestStoreArgs) => ConcreteRequest<any>) {
	return {
		name: 'dstore Request',

		before: function () {
			registryHandle = providerRegistry.register(/.*mockRequest.*/, mockRequestProvider.respond);
			return request.get((<any> require).toUrl('tests/unit/data/treeTestRoot')).then(function (response: any) {
				treeTestRootData = response.data;
			});
		},

		after: function () {
			registryHandle.destroy();
		},

		beforeEach: function () {
			mockRequestProvider.setResponseText('{}');
			mockRequestProvider.setResponseHeaders({});
			store = new Store({
				target: '/mockRequest/',
				headers: globalHeaders,
				Model: Model
			});
			store.Model.prototype.describe = function() {
				return "name is " + this.name;
			}
		},

		'filter': function () {
			mockRequestProvider.setResponseText(treeTestRootData);

			return store.filter<{ name: string; describe: () => string; someProperty: string }>('data/treeTestRoot').fetch().then(function (results) {
				const object = results[0];
				assert.strictEqual(object.name, 'node1');
				assert.strictEqual(object.describe(), 'name is node1');
				assert.strictEqual(object.someProperty, 'somePropertyA');
			});
		},

		'filter iterative': function () {
			mockRequestProvider.setResponseText(treeTestRootData);

			let i = 0;
			return store.filter<{ name: string, describe: () => string }>('data/treeTestRoot').forEach(function (object) {
				i++;
				assert.strictEqual(object.name, 'node' + i);
				// the method we added
				assert.equal(typeof object.describe, 'function');
			});
		},

		'filter object': function () {
			const filter = { prop1: 'Prop1Value', prop2: 'Prop2Value' };
			return runCollectionTest(store.filter(filter), { queryParams: filter });
		},

		'filter builder': function () {
			const filter = new store.Filter();
			const betweenTwoAndFour = filter.gt('id', 2).lt('price', 5);
			return runCollectionTest(store.filter(betweenTwoAndFour), {
				queryParams: {
					id: 'gt=2',
					price: 'lt=5'
				}
			});
		},

		'filter builder ne or': function () {
			const filter = new store.Filter();
			const betweenTwoAndFour = filter.ne('id', 2).or(filter.eq('foo', true), filter.eq('foo'));
			return runCollectionTest(store.filter(betweenTwoAndFour), {
				queryParams: {
					id: 'ne=2|foo=true|foo=undefined'
				}
			});
		},

		'filter relational': function () {
			const filter = new store.Filter();
			const innerFilter = new store.Filter().eq('foo', true);
			const nestedFilter = filter[ 'in' ]('id', store.filter(innerFilter).select('id'));
			return runCollectionTest(store.filter(nestedFilter), {
				queryParams: {
					id: 'in=(/mockRequest/?foo=true&select(id))'
				}
			});
		},

		'sort': function () {
			const sortedCollection = store.sort({
				property: 'prop1',
				descending: true
			}, {
				property: 'prop2'
			}, {
				property: 'prop3',
				descending: true
			});
			return runCollectionTest(sortedCollection, {
				queryParams: {
					'sort(-prop1,+prop2,-prop3)': ''
				}
			});
		},

		'sort with this.sortParam': function () {
			store.sortParam = 'sort-param';

			const sortedCollection = store.sort({
				property: 'prop1',
				descending: true
			}, {
				property: 'prop2'
			}, {
				property: 'prop3',
				descending: true
			});
			return runCollectionTest(sortedCollection, {
				queryParams: {
					'sort-param': '-prop1,+prop2,-prop3'
				}
			});
		},

		'sort with different prefixes': function () {
			store.descendingPrefix = '--';
			store.ascendingPrefix = '++';

			const sortedCollection = store.sort({
				property: 'prop1',
				descending: true
			}, {
				property: 'prop2'
			}, {
				property: 'prop3',
				descending: true
			});
			return runCollectionTest(sortedCollection, {
				queryParams: {
					'sort(--prop1,++prop2,--prop3)': ''
				}
			});
		},
		'select': function () {
			const selectCollection = store.select([ 'prop1', 'prop2' ]);
			return runCollectionTest(selectCollection, {
				queryParams: {
					'select(prop1,prop2)': ''
				}
			});
		},
		'select with selectParam': function () {
			store.selectParam = 'select-param';
			const selectCollection = store.select([ 'prop1', 'prop2' ]);
			return runCollectionTest(selectCollection, {
				queryParams: {
					'select-param': 'prop1,prop2'
				}
			});
		},
		'range': function () {
			return runCollectionTest(store, { start: 15, end: 25 }, <any> {
				queryParams: {
					'limit(10,15)': ''
				}
			});
		},
		'range with rangeParam': function () {
			store.rangeStartParam = 'start';
			store.rangeCountParam = 'count';
			return runCollectionTest(store, { start: 15, end: 25 }, <any> {
				queryParams: {
					'start': '15',
					'count': '10'
				}
			});
		},
		'range with headers': function () {
			store.useRangeHeaders = true;
			return runCollectionTest(store, { start: 15, end: 25 }, {
				headers: {
					'Range': 'items=15-24'
				}
			});
		},

		'range with headers without end': function () {
			store.useRangeHeaders = true;
			return runCollectionTest(store, { start: 15, end: Infinity }, {
				headers: {
					'Range': 'items=15-Infinity'
				}
			});
		},

		'filter+sort+fetchRange': function () {
			const filter = { prop1: 'Prop1Value', prop2: 'Prop2Value' };
			const collection = store.filter(filter).sort('prop1');
			return runCollectionTest(collection, { start: 15, end: 25 }, <any> {
				queryParams: lang.mixin({}, filter, {
					'limit(10,15)': '',
					'sort(+prop1)': ''
				})
			});
		},

		// TODO - convert SimpleQuery and uncomment
		'composition with client-side queriers': function () {
			// var RestWithQueryEngine = declare([ Store, SimpleQuery ], {
			//   target: '/mockRequest/'
			// });
			//
			// var store = new RestWithQueryEngine(),
			// expectedResults = [
			//      { id: 1, name: 'one', odd: true },
			//      { id: 2, name: 'two', odd: false },
			//      { id: 3, name: 'three', odd: true }
			// ];
			// mockRequest.setResponseText(JSON.stringify(expectedResults));
			// var filter = { odd: true },
			// filteredCollection = store.filter(filter),
			// sortedCollection,
			// getTopQueryLogEntry = function (collection) {
			//      var queryLog = collection.queryLog;
			//      return queryLog[queryLog.length - 1];
			// },
			// querier;
			//
			// assert.strictEqual(filteredCollection.queryLog.length, 1);
			// return when(filteredCollection.fetch()).then(function (results) {
			// mockRequest.assertQuery(filter);
			// assert.strictEqual(results.length, expectedResults.length);
			//
			// var queryLogEntry = getTopQueryLogEntry(filteredCollection);
			// assert.property(queryLogEntry, 'querier');
			// querier = queryLogEntry.querier;
			//
			// var filteredResults = querier(expectedResults);
			// assert.equal(filteredResults.length, 2);
			// assert.deepEqual(filteredResults[0], expectedResults[0]);
			// assert.deepEqual(filteredResults[1], expectedResults[2]);
			//
			// sortedCollection = filteredCollection.sort('id', true);
			// assert.strictEqual(sortedCollection.queryLog.length, 2);
			//
			// return sortedCollection.fetch();
			// }).then(function (results) {
			// mockRequest.assertQuery({ 'sort(-id)': '' });
			// assert.strictEqual(results.length, expectedResults.length);
			//
			// var queryLogEntry = getTopQueryLogEntry(sortedCollection);
			// assert.property(queryLogEntry, 'querier');
			// querier = (function () {
			//      var existingQueryer = querier,
			//      newQueryer = queryLogEntry.querier;
			//      return function (data) {
			//        return newQueryer(existingQueryer(data));
			//      };
			// })();
			//
			// var sortedFilteredResults = querier(expectedResults);
			// assert.equal(sortedFilteredResults.length, 2);
			// assert.deepEqual(sortedFilteredResults[0], expectedResults[2]);
			// assert.deepEqual(sortedFilteredResults[1], expectedResults[0]);
			//
			// return sortedCollection.fetchRange({start: 0, end: 25});
			// }).then(function (results) {
			// mockRequest.assertQuery({
			//      'sort(-id)': '',
			//      'limit(25)': ''
			// });
			// assert.strictEqual(results.length, expectedResults.length);
			// });
		}
	};
}
registerSuite(createRequestTests(<any> ConcreteRequest));
