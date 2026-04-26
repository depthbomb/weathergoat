import { join } from 'node:path';
import { inspect } from 'node:util';
import { LogLayer } from 'loglayer';
import { LOGS_DIR } from '@constants';
import { serializeError } from 'serialize-error';
import { sprintfPlugin } from '@loglayer/plugin-sprintf';
import { withScope, captureException } from '@sentry/bun';
import { redactionPlugin } from '@loglayer/plugin-redaction';
import { LogFileRotationTransport } from '@loglayer/transport-log-file-rotation';
import { getSimplePrettyTerminal } from '@loglayer/transport-simple-pretty-terminal';

type ErrorDescription = {
	name: string;
	message: string;
	path?: string;
	stack?: string;
};

type ErrorNode = {
	error: unknown;
	path?: string;
};

export const logger = new LogLayer({
	errorSerializer: serializeError,
	transport: [
		getSimplePrettyTerminal({
			runtime: 'node',
			viewMode: 'inline'
		}),
		new LogFileRotationTransport({
			filename: join(LOGS_DIR, 'app-%DATE%.log'),
			dateFormat: 'YMD',
			frequency: 'daily',
			maxLogs: 5
		}),
	],
	plugins: [
		sprintfPlugin(),
		redactionPlugin({
			paths: ['token', 'botToken', 'password']
		})
	]
});

export function reportError(message: string, err: unknown, metadata?: object) {
	const details = collectErrorDetails(err);
	const summary = summarizeError(err, details);
	const root = getPrimaryError(err, details);
	const reportedError = createReportedError(summary, root);
	const rootDetails = describeError(root);
	const nestedDetails = details.slice(1);
	const normalizedMetadata = metadata ? serializePlain(metadata) : undefined;

	withScope(scope => {
		scope.setLevel('fatal');
		scope.setTag('reporter', 'reportError');
		scope.setTag('error_name', rootDetails.name);
		scope.setContext('report', {
			message,
			summary
		});

		if (normalizedMetadata) {
			scope.setContext('metadata', normalizedMetadata);
		}

		scope.setContext('error', {
			name: rootDetails.name,
			message: rootDetails.message,
			stack: rootDetails.stack,
			type: getErrorType(err),
			nested: nestedDetails
		});

		captureException(reportedError);
	});

	logger
		.withError(root)
		.withMetadata({
			...normalizedMetadata,
			errType: getErrorType(err),
			errSummary: summary,
			errNestedCount: nestedDetails.length,
			errNested: nestedDetails
		})
		.fatal(`${message}: ${summary}`);
}

function summarizeError(err: unknown, details = collectErrorDetails(err)) {
	const root = getPrimaryError(err, details);
	const parts = [root.name, root.message].filter(Boolean);
	const base = parts.join(': ') || inspect(err, { depth: 2, breakLength: Infinity });

	const specificDetails = getSpecificErrorDetails(details);
	if (!isGenericErrorMessage(root.message) || specificDetails.length === 0) {
		return base;
	}

	const nestedSummary = specificDetails
		.slice(0, 3)
		.map(formatErrorDetail)
		.join(' | ');

	return nestedSummary || base;
}

function getPrimaryError(err: unknown, details = collectErrorDetails(err)): Error {
	const best = getSpecificErrorDetails(details)[0];
	if (best) {
		const wrapped = new Error(best.path ? `${best.path}: ${best.message}` : best.message, { cause: asError(err) });
		wrapped.name = best.name;
		return wrapped;
	}

	const chain = collectErrors(err);
	return chain.find(value => value instanceof Error) ?? asError(err);
}

function describeError(err: unknown, path?: string): ErrorDescription {
	const asErr = asError(err);

	return {
		name: asErr.name || getErrorType(err),
		message: asErr.message || '(no message)',
		path,
		stack: asErr.stack
	};
}

function collectErrorDetails(err: unknown) {
	return collectErrorNodes(err).map(node => describeError(node.error, node.path));
}

function collectErrors(err: unknown, seen = new WeakSet<object>()) {
	return collectErrorNodes(err, seen).map(node => node.error);
}

function collectErrorNodes(err: unknown, seen = new WeakSet<object>()) {
	const results: ErrorNode[] = [];

	const visit = (value: unknown, path?: string) => {
		if (isObject(value)) {
			if (seen.has(value)) {
				return;
			}

			seen.add(value);
		}

		results.push({ error: value, path });

		const cause = getProperty(value, 'cause');
		if (cause) {
			visit(cause, path);
		}

		for (const nested of getNestedErrors(value, path)) {
			visit(nested.error, nested.path);
		}
	};

	visit(err);

	return results;
}

function getNestedErrors(value: unknown, currentPath?: string): ErrorNode[] {
	if (value instanceof AggregateError) {
		return Array.from(value.errors).map((error, index) => ({
			error,
			path: appendPath(currentPath, `[${index}]`)
		}));
	}

	const errors = getProperty(value, 'errors');
	if (!Array.isArray(errors)) {
		return [];
	}

	return errors.map(entry => {
		if (Array.isArray(entry) && entry.length === 2) {
			const [key, nested] = entry;
			const propertyPath = appendPath(currentPath, String(key));
			return {
				error: prependErrorContext(nested, `property=${String(key)}`),
				path: propertyPath
			};
		}

		return {
			error: entry,
			path: currentPath
		};
	});
}

function prependErrorContext(err: unknown, context: string) {
	const original = asError(err);
	if (original.message.startsWith(`[${context}] `)) {
		return original;
	}

	const wrapped = new Error(`[${context}] ${original.message}`, { cause: original });
	wrapped.name = original.name;
	return wrapped;
}

function asError(err: unknown): Error {
	if (err instanceof Error) {
		return err;
	}

	const inspected = inspect(err, { depth: 4 });
	const wrapped = new Error(inspected);
	wrapped.name = getErrorType(err);
	return wrapped;
}

function createReportedError(summary: string, root: Error) {
	if (summary === `${root.name}: ${root.message}` || summary === root.message) {
		return root;
	}

	const wrapped = new Error(summary, { cause: root });
	wrapped.name = root.name;
	return wrapped;
}

function getSpecificErrorDetails(details: ErrorDescription[]) {
	const seen = new Set<string>();

	return details
		.filter(detail => !isGenericErrorMessage(detail.message))
		.filter(detail => {
			const key = `${detail.path ?? ''}|${detail.name}|${detail.message}`;
			if (seen.has(key)) {
				return false;
			}

			seen.add(key);
			return true;
		});
}

function formatErrorDetail(detail: ErrorDescription) {
	const prefix = detail.path ? `${detail.path}: ` : '';
	return `${prefix}${detail.message}`;
}

function getErrorType(err: unknown) {
	if (err instanceof Error && err.name) {
		return err.name;
	}

	if (err === null) {
		return 'null';
	}

	return typeof err;
}

function isGenericErrorMessage(message: string) {
	return [
		'Received one or more errors',
		'One or more errors occurred'
	].includes(message);
}

function appendPath(base: string | undefined, segment: string) {
	return base ? `${base}.${segment}` : segment;
}

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
	return typeof value === 'object' && value !== null;
}

function getProperty(value: unknown, key: PropertyKey) {
	if (!isObject(value)) {
		return undefined;
	}

	return value[key];
}

function serializePlain(value: unknown) {
	return JSON.parse(JSON.stringify(value, (_key, nested) => {
		if (nested instanceof Error) {
			return serializeError(nested);
		}

		if (typeof nested === 'bigint') {
			return nested.toString();
		}

		return nested;
	}));
}
