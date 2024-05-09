import { Cache } from '@lib/cache';
import { HttpClient } from '@lib/http';
import { Glossary } from '@models/glossary';
import { plainToClass } from 'class-transformer';
import type { GlossaryEntry } from '@models/glossary-entry';

const http     = new HttpClient({ retry: true });
const cache    = new Cache('1w');
const cacheKey = 'glossary' as const;

export async function getEntries(): Promise<GlossaryEntry[]> {
	if (cache.has(cacheKey)) {
		return cache.get<Glossary>(cacheKey)!.glossary;
	}

	const res = await http.get('https://api.weather.gov/glossary');
	if (!res.ok) {
		throw new Error(res.statusText);
	}

	const json = await res.json();
	const data = plainToClass(Glossary, json);

	cache.set(cacheKey, data);

	return data.glossary;
}

export async function getEntry(term: string): Promise<GlossaryEntry | null> {
	term = term.toLowerCase().trim()
	const entries    = await getEntries();
	const definition = entries.find(g => g.originalTerm?.toLowerCase() === term) ?? null;

	return definition;
}
