import { Handle, Hash } from 'dojo-core/interfaces';
import * as lang from 'dojo-core/lang';
import * as aspect from 'dojo-core/aspect';
import request, { providerRegistry, RequestOptions } from 'dojo-core/request';
import registerSuite = require('intern!object');
import assert = require('intern/chai!assert');
import { createRequestTests } from './Request';
import * as mockRequestProvider from './mockRequestProvider';
import * as dstore from 'src/interfaces';
import Rest from 'src/Rest';

const globalHeaders: Hash<string> = {
	'test-global-header-a': 'true',
	'test-global-header-b': 'yes'
};
const requestHeaders: Hash<string> = {
	'test-local-header-a': 'true',
	'test-local-header-b': 'yes',
	'test-override': 'overridden'
};
let store: Rest<any>;

function runHeaderTest(method: string, args: any[]) {
	return store[method].apply(store, args).then(function () {
		mockRequestProvider.assertRequestHeaders(requestHeaders);
		mockRequestProvider.assertRequestHeaders(globalHeaders);
	});
}

let nodeData_1_1: string;
let registryHandle: Handle;
const tests = createRequestTests(Rest);
lang.mixin(tests, {
	name: 'dstore Rest',

	before: function () {
		registryHandle = providerRegistry.register(/.*mockRequest.*/, mockRequestProvider.respond);
		return request.get((<any> require).toUrl('tests/unit/data/node1.1')).then(function (response: any) {
			nodeData_1_1 = response.data;
		});
	},

	'get': function () {
		mockRequestProvider.setResponseText(nodeData_1_1);

		return store.get('data/node1.1').then(function (object) {
			assert.strictEqual(object.name, 'node1.1');
			assert.strictEqual(object.describe(), 'name is node1.1');
			assert.strictEqual(object.someProperty, 'somePropertyA1');
		});
	},

	'headers get 1': function () {
		return runHeaderTest('get', [ 'mockRequest/1', requestHeaders ]);
	},

	'headers get 2': function () {
		return runHeaderTest('get', [ 'mockRequest/2', { headers: requestHeaders } ]);
	},
	'headers remove': function () {
		return runHeaderTest('remove', [ 'mockRequest/3', { headers: requestHeaders } ]);
	},

	'headers put': function () {
		return runHeaderTest('put', [
			{},
			{
				id: 'mockRequest/4',
				headers: requestHeaders
			}
		]);
	},

	'headers add': function () {
		return runHeaderTest('add', [
			{},
			{
				id: 'mockRequest/5',
				headers: requestHeaders
			}
		]);
	},

	'put object without ID': function () {
		const objectWithoutId = { name: 'one' };
		mockRequestProvider.setResponseText(store.stringify(objectWithoutId));
		return store.put(objectWithoutId).then(function () {
			mockRequestProvider.assertHttpMethod('POST');
		});
	},

	'put object with ID': function () {
		const objectWithId = { id: 1, name: 'one' };
		mockRequestProvider.setResponseText(store.stringify(objectWithId));
		return store.put(objectWithId).then(function () {
			mockRequestProvider.assertHttpMethod('PUT');
		});
	},

	'put object with store.defaultNewToStart': function () {
		function testPutPosition(object: any, options: dstore.PutDirectives, expectedHeaders: Hash<any>) {
			store.defaultNewToStart = undefined;
			return store.put(object, options).then(function () {
				mockRequestProvider.assertRequestHeaders(expectedHeaders['defaultUndefined']);
			}).then(function () {
				store.defaultNewToStart = false;
				return store.put(object, options);
			}).then(function () {
				mockRequestProvider.assertRequestHeaders(expectedHeaders['defaultEnd']);
				store.defaultNewToStart = true;
				return store.put(object, options);
			}).then(function () {
				mockRequestProvider.assertRequestHeaders(expectedHeaders['defaultStart']);
			});
		}

		const objectWithId = { id: 1, name: 'one' },
			objectWithoutId = { name: 'missing identity' },
			optionsWithoutOverwrite = {},
			optionsWithOverwriteTrue = { overwrite: true },
			optionsWithOverwriteFalse = { overwrite: false },
			noExpectedPositionHeaders: Hash<Hash<{}>> = {
				defaultUndefined: { 'Put-Default-Position': null },
				defaultEnd: { 'Put-Default-Position': null },
				defaultStart: { 'Put-Default-Position': null }
			},
			expectedPositionHeaders = {
				defaultUndefined: { 'Put-Default-Position': 'end' },
				defaultEnd: { 'Put-Default-Position': 'end' },
				defaultStart: { 'Put-Default-Position': 'start' }
			};

		const tests = [
			[ objectWithId, optionsWithoutOverwrite, noExpectedPositionHeaders ],
			[ objectWithId, optionsWithOverwriteTrue, noExpectedPositionHeaders ],
			[ objectWithId, optionsWithOverwriteFalse, expectedPositionHeaders ],
			[ objectWithoutId, optionsWithoutOverwrite, expectedPositionHeaders ],
			[ objectWithoutId, optionsWithOverwriteTrue, expectedPositionHeaders ],
			[ objectWithoutId, optionsWithOverwriteFalse, expectedPositionHeaders ]
		];

		let promise = testPutPosition.apply(null, tests[0]);
		let i: number;
		for (i = 0; i < tests.length; ++i) {
			promise = promise.then(function () {
				return testPutPosition.apply(null, tests[i]);
			});
		}
	},

	'put object with options.beforeId': function () {
		store.defaultNewToStart = true;
		return store.put({ id: 1, name: 'one' }, { beforeId: 123 }).then(function () {
			mockRequestProvider.assertRequestHeaders({
				'Put-Before': '123',
				'Put-Default-Position': ''
			});
		}).then(function () {
			return store.put({ id: 2, name: 'two' }, { beforeId: null });
		}).then(function () {
			mockRequestProvider.assertRequestHeaders({
				'Put-Before': null,
				'Put-Default-Position': 'end'
			});
		});
	},

	'get and save': function () {
		const expectedObject = { id: 1, name: 'one' };
		mockRequestProvider.setResponseText(store.stringify(expectedObject));
		return store.get('anything').then(function (object) {
			mockRequestProvider.setResponseText(store.stringify(expectedObject));
			return store.put(object).then(function (result: any) {
				assert.deepEqual(store.stringify(result), store.stringify(expectedObject));
			});
		});
	}
});
registerSuite(tests);
