import Promise from 'dojo-core/Promise';
import Task from 'dojo-core/async/Task';
import {duplicate, mixin} from 'dojo-core/lang';
import * as dstore from './interfaces';

export interface QueryOptions {
	totalLength?: number| Promise<number>;
	response: any;
	length?: number;
	forEach?: <T>(callback:(value: T, index: number, source: T[]) => any, instance: any) => Promise<void>;
}

function forEach<T>(callback: (value: T, index?: number, array?: T[]) => void, thisObject?: any): Promise<void> {
	const execute = function (resolve: any, reject: any) {
		if (this.then) {
			this.then(resolve, reject);
		}
		else {
			resolve(this);
		}
	}.bind(this);
	return  new Promise<Array<T>>(execute).then(function (data) {
		for (var i = 0, l = data.length; i < l; i++) {
			callback.call(thisObject, data[i], i, data);
		}
	});
}

export default function QueryResults<T>(data: dstore.FetchPromise<T>| Task<T> | T[], options: QueryOptions):
	dstore.FetchPromise<T> | T[] {
	var hasTotalLength = options && 'totalLength' in options;
	let resultsData: dstore.FetchPromise<T>;
	/* TODO - Remove (<any>data.then and cast, only needed because we're interacting with Dojo 1 Promises */
	if (data instanceof Promise || (<any>data).then) {
		resultsData = new Promise(function (resolve, reject) {
			return (<dstore.FetchPromise<T>>data).then(resolve, reject);
		});
		// a promise for the eventual realization of the totalLength, in
		// case it comes from the resolved data
		var totalLengthPromise = resultsData.then(function (data: T[]) {
			// calculate total length, now that we have access to the resolved data
			let totalLength = hasTotalLength ? options.totalLength :
				(<any>data).totalLength || data.length;
			// make it available on the resolved data
			(<any>data).totalLength = totalLength;
			// don't return the totalLength promise unless we need to, to avoid
			// triggering a lazy promise
			return !hasTotalLength && totalLength;
		});
		// make the totalLength available on the promise (whether through the options or the eventual
		// access to the resolved data)
		resultsData.totalLength = hasTotalLength ? options.totalLength : totalLengthPromise;
		// make the response available as well
		resultsData.response = options && options.response;
		resultsData.forEach = forEach;
		return resultsData;
	} else if (data instanceof Array) {
		(<any>data).totalLength = hasTotalLength ? options.totalLength : data.length;
		return data;
	}
}
