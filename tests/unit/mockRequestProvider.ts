import Task from 'dojo-core/async/Task';
import { Hash } from 'dojo-core/interfaces';
import * as lang from 'dojo-core/lang';
import { ResponsePromise, Response, RequestOptions } from 'dojo-core/request'
import UrlSearchParams, { ParamList } from 'dojo-core/UrlSearchParams';
import assert = require('intern/chai!assert');

// A mock request handler for testing.
var latestUrl: string;
var latestQuery: UrlSearchParams;
var	latestRequestHeaders: { [ name: string]: string };
var	responseHeaders: Hash<string>;
var	latestOptions: RequestOptions;
var	responseText: string;

export function respond(url: string, options: RequestOptions) {
	latestUrl = url;
	latestQuery = new UrlSearchParams(url.match(/[^?]*(?:\?([^#]*))?/)[ 1 ] || '');
	latestOptions = options;
	latestRequestHeaders = {};

	var headers = options['headers'];
	for (var name in headers) {
		latestRequestHeaders[name.toLowerCase()] = headers[name];
	}

	return <ResponsePromise<any>> Task.resolve({
		url: url,
		statusCode: 200,
		requestOptions: latestOptions,
		data: responseText,
		getHeader: function (name: string) {
			return responseHeaders[name.toLowerCase()];
		}
	});
}

export function setResponseText(text: string) {
	responseText = text;
}

export function setResponseHeaders(headers: Hash<string>) {
	responseHeaders = {};
	for (var name in headers) {
		responseHeaders[name.toLowerCase()] = headers[name];
	}
}

export function assertHttpMethod(expectedMethod: string) {
	assert.strictEqual(latestOptions.method || 'GET', expectedMethod);
}

export function assertRequestHeaders(expectedHeaders: Hash<string>) {
	for (var name in expectedHeaders) {
		var lowerCaseName = name.toLowerCase(),
			value = expectedHeaders[name];

		if (value === null) {
			assert.isTrue(
				!(lowerCaseName in latestRequestHeaders)
				|| latestRequestHeaders[lowerCaseName] === null
			);
		} else {
			assert.isTrue(lowerCaseName in latestRequestHeaders);
			assert.strictEqual(latestRequestHeaders[lowerCaseName], expectedHeaders[name]);
		}
	}
}

export function assertQuery(expectedParams: UrlSearchParams) {
	const expectedParamsKeys = expectedParams.keys();
	const latestQueryKeys = latestQuery.keys();
	for (let i = 0; i < expectedParamsKeys.length; i++) {
		assert.include(latestQueryKeys, expectedParamsKeys[i]);
		assert.equal(expectedParams.get(expectedParamsKeys[i]), latestQuery.get(expectedParamsKeys[i]));
	}
}
