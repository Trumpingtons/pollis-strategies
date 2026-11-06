/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 Antonio Saragga Seabra
 *  Licensed under the GNU Affero General Public License v3.0. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Check the answering strategies of strategies/, and write the catalogue Pollis reads. Run by the workflows of
// .github/workflows; needs only Node 22.18 or later.
//
//   node scripts/strategies.ts check [--parser <file or URL>]           check every strategy
//   node scripts/strategies.ts publish <folder> [--parser <file or URL>]  check them, and write <folder>/strategies.json
//                                                                         and a copy of each file
//
// A strategy is read with Pollis' own TOML reader, build/pollis/pollisToml.mjs of saragga/pollis (main, unless
// --parser names another), so it is read here as Pollis reads it. The checks are those of Pollis
// (askStrategyOfFile in src/vs/workbench/contrib/compose/common/askPollisStrategies.ts), and:
//   - a file is named after its strategy's id, strategies/<id>.toml, and no other file has that id
//   - the id is not base or panelAware, the strategies of Pollis
//   - a file is at most 64 KB
// strategies.json holds, for each strategy, its file and the file's TOML read as data, which Pollis checks again.
// Writes a report to the standard output and, on GitHub, to the job summary. Exit status: 0 when there are no errors,
// 1 otherwise.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.join(import.meta.dirname, '..');
const STRATEGIES = path.join(ROOT, 'strategies');
const DEFAULT_PARSER = 'https://raw.githubusercontent.com/saragga/pollis/main/build/pollis/pollisToml.mjs';
/** The ids of the strategies of Pollis itself, which a file may not take. */
const BUILT_IN = new Set(['base', 'panelAware']);
const MAX_FILE_BYTES = 64 * 1024;

type Table = { [key: string]: unknown };
type Parser = { parseToml(text: string): unknown };

function isTable(value: unknown): value is Table {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Pollis' TOML reader, from a file or a URL. */
async function loadParser(source: string): Promise<Parser> {
	if (!/^https?:/.test(source)) {
		return import(pathToFileURL(path.resolve(source)).href) as Promise<Parser>;
	}
	const response = await fetch(source);
	if (!response.ok) {
		throw new Error(`cannot read Pollis' TOML reader at ${source}: ${response.status}`);
	}
	const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pollis-strategies-')), 'pollisToml.mjs');
	fs.writeFileSync(file, await response.text());
	return import(pathToFileURL(file).href) as Promise<Parser>;
}

/** The keys of `table` that are not among `known`, as problems of `where`. */
function unknownKeys(table: Table, known: readonly string[], where: string): string[] {
	return Object.keys(table).filter(key => !known.includes(key)).map(key => `${where}: Pollis does not know ${key} here (it knows ${known.join(', ')}).`);
}

function share(table: Table, key: string, where: string, problems: string[]): void {
	const value = table[key];
	if (typeof value !== 'number' || !(value >= 0 && value <= 1)) {
		problems.push(`${where}: ${key} must be a number from 0 to 1, as 0.75 for six passages of eight.`);
	}
}

function text(table: Table, key: string, where: string, problems: string[], choices?: readonly string[], fallback?: string): string {
	const value = table[key] ?? fallback;
	if (typeof value !== 'string' || !value.trim()) {
		problems.push(choices ? `${where}: needs ${key}, one of ${choices.join(', ')}.` : `${where}: needs ${key}.`);
		return '';
	}
	if (choices && !choices.includes(value)) {
		problems.push(`${where}: ${key} cannot be "${value}" (it can be ${choices.join(', ')}).`);
	}
	return value.trim();
}

/** The kind of the step `table`, #`index`, after checking it; empty when it has none Pollis knows. */
function checkStep(table: unknown, index: number, problems: string[]): string {
	const where = `[[steps]] #${index + 1}`;
	if (!isTable(table)) {
		problems.push(`${where}: must be a table.`);
		return '';
	}
	const before = problems.length;
	const step = text(table, 'step', where, problems, ['search', 'rerank', 'answer']);
	if (problems.length > before) {
		return '';
	}
	const at = `${where} (${step})`;
	if (step === 'search') {
		const adaptive = 'panelNear' in table || 'panelFar' in table;
		problems.push(...unknownKeys(table, adaptive ? ['step', 'panelNear', 'panelFar'] : ['step', 'panelShare'], at));
		for (const key of adaptive ? ['panelNear', 'panelFar'] : ['panelShare']) {
			share(table, key, at, problems);
		}
	} else if (step === 'rerank') {
		problems.push(...unknownKeys(table, ['step', 'by', 'query'], at));
		text(table, 'by', at, problems, ['reranker']);
		text(table, 'query', at, problems, ['question', 'panel'], 'question');
	} else {
		problems.push(...unknownKeys(table, ['step', 'panel'], at));
		text(table, 'panel', at, problems, ['named', 'card', 'none']);
	}
	return step;
}

/** The problems of a strategy's TOML read as `data`, and its id. */
function checkStrategy(data: unknown): { id: string; problems: string[] } {
	const problems: string[] = [];
	if (!isTable(data)) {
		return { id: '', problems: ['It is not a strategy: it needs [strategy] and [[steps]].'] };
	}
	problems.push(...unknownKeys(data, ['strategy', 'steps'], 'The file'));
	const head = isTable(data.strategy) ? data.strategy : undefined;
	let id = '';
	if (!head) {
		problems.push('It needs [strategy], with its id, label and description.');
	} else {
		problems.push(...unknownKeys(head, ['id', 'label', 'description', 'author'], '[strategy]'));
		id = text(head, 'id', '[strategy]', problems);
		if (id && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
			problems.push(`[strategy]: the id "${id}" must be letters, digits, - and _, starting with a letter.`);
		}
		text(head, 'label', '[strategy]', problems);
		text(head, 'description', '[strategy]', problems);
	}
	const tables = Array.isArray(data.steps) ? data.steps : [];
	const steps = tables.map((table, index) => checkStep(table, index, problems));
	const order = steps.join(',');
	if (steps.every(step => step) && order !== 'search,answer' && order !== 'search,rerank,answer') {
		problems.push('[[steps]]: a strategy takes the steps search, rerank if it reranks, and answer, in that order, each once.');
	}
	return { id, problems };
}

async function main(): Promise<number> {
	const args = process.argv.slice(2);
	const mode = args[0];
	const parserAt = args.indexOf('--parser');
	const parser = await loadParser(parserAt >= 0 ? args[parserAt + 1] : DEFAULT_PARSER);
	const out = mode === 'publish' ? args[1] : undefined;
	if ((mode !== 'check' && mode !== 'publish') || (mode === 'publish' && (!out || out.startsWith('--')))) {
		console.error('Usage: node scripts/strategies.ts check | publish <folder> [--parser <file or URL>]');
		return 1;
	}

	const files = fs.readdirSync(STRATEGIES).filter(name => name.endsWith('.toml')).sort();
	const report: string[] = [];
	const entries: { file: string; data: unknown }[] = [];
	const ids = new Map<string, string>();
	let errors = 0;
	for (const file of files) {
		const full = path.join(STRATEGIES, file);
		const problems: string[] = [];
		let data: unknown;
		if (fs.statSync(full).size > MAX_FILE_BYTES) {
			problems.push(`The file is larger than ${MAX_FILE_BYTES / 1024} KB.`);
		} else {
			try {
				data = parser.parseToml(fs.readFileSync(full, 'utf-8'));
			} catch (error) {
				problems.push(`Pollis cannot read it: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		if (data !== undefined) {
			const checked = checkStrategy(data);
			problems.push(...checked.problems);
			if (checked.id) {
				if (file !== `${checked.id}.toml`) {
					problems.push(`The file must be named after its id: strategies/${checked.id}.toml.`);
				}
				if (BUILT_IN.has(checked.id)) {
					problems.push(`The id "${checked.id}" is that of a strategy of Pollis.`);
				}
				if (ids.has(checked.id)) {
					problems.push(`${ids.get(checked.id)} has the id "${checked.id}" too.`);
				}
				ids.set(checked.id, file);
			}
		}
		errors += problems.length;
		report.push(problems.length ? `- strategies/${file}: ${problems.length} problems\n${problems.map(problem => `  - ${problem}`).join('\n')}` : `- strategies/${file}: valid`);
		if (!problems.length) {
			entries.push({ file, data });
		}
	}
	const summary = `${files.length} strategies, ${errors} problems\n\n${report.join('\n')}\n`;
	console.log(summary);
	if (process.env.GITHUB_STEP_SUMMARY) {
		fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Answering strategies\n\n${summary}`);
	}
	if (errors) {
		return 1;
	}
	if (out) {
		fs.mkdirSync(out, { recursive: true });
		for (const { file } of entries) {
			fs.copyFileSync(path.join(STRATEGIES, file), path.join(out, file));
		}
		fs.writeFileSync(path.join(out, 'strategies.json'), JSON.stringify({ strategies: entries }, null, 1) + '\n');
		console.log(`Wrote ${out}/strategies.json and ${entries.length} strategies.`);
	}
	return 0;
}

main().then(code => process.exit(code), error => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
