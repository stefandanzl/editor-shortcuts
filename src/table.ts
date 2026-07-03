import { App, Editor, FuzzySuggestModal, MarkdownView, Notice } from "obsidian";
import EditorShortcutsPlugin from "./main";

// Picker shown when the CSV delimiter can't be auto-detected confidently.
// Uses Obsidian's built-in FuzzySuggestModal (type-to-filter, keyboard nav).
type CsvDelimiterOption = { delim: string; label: string; cols: number; rows: number };

class CsvDelimiterSuggestModal extends FuzzySuggestModal<CsvDelimiterOption> {
	constructor(
		app: App,
		private options: CsvDelimiterOption[],
		private onPick: (delim: string) => void,
	) {
		super(app);
		this.setPlaceholder("Pick a CSV delimiter…");
	}

	getItems(): CsvDelimiterOption[] {
		return this.options;
	}

	getItemText(item: CsvDelimiterOption): string {
		return `${item.label}  →  ${item.cols} column${item.cols === 1 ? "" : "s"}, ${item.rows} row${item.rows === 1 ? "" : "s"}`;
	}

	onChooseItem(item: CsvDelimiterOption): void {
		this.onPick(item.delim);
	}
}

export async function registerTableCommands(plugin: EditorShortcutsPlugin) {
	// Command to fill selected vertical table cells (Excel-style behavior)
	plugin.addCommand({
		id: "table-fill-down",
		name: "Table Fill Down",
		icon: "table",
		editorCallback: (editor: Editor, ctx) => {
			if (!(ctx instanceof MarkdownView)) {
				new Notice("No active tab!");
				return;
			}
			const containerEl = ctx.containerEl;

			const selectedCells = Array.from(
				containerEl.querySelectorAll<HTMLElement>(".cm-embed-block .is-selected"),
			);

			if (selectedCells.length < 2) {
				new Notice("Please select at least two vertical cells!");
				return;
			}

			const cellData = selectedCells.map((cell) => {
				const parentRow = cell.closest("tr") as HTMLElement;
				const allRows = Array.from(parentRow.parentElement!.children);
				return {
					columnIndex: Array.from(parentRow.children).indexOf(cell),
					rowIndex: allRows.indexOf(parentRow),
					content: cell.innerText?.trim() || "",
				};
			});

			const fillValue = cellData[0].content;
			const targetColumn = cellData[0].columnIndex;
			const affectedRows = cellData.map((c) => c.rowIndex + 1);

			const cmView = (editor as any).cm;
			if (!cmView) return;

			const state = cmView.state;
			const initialSelection = state.selection; // Save the active table block selection range
			const head = state.selection.main.head;
			const currentLine = state.doc.lineAt(head);

			let startLineNo = currentLine.number;
			while (startLineNo > 1 && state.doc.line(startLineNo - 1).text.includes("|")) {
				startLineNo--;
			}

			let endLineNo = currentLine.number;
			while (endLineNo < state.doc.lines && state.doc.line(endLineNo + 1).text.includes("|")) {
				endLineNo++;
			}

			let tableRowIndex = 0;
			const changes: any[] = [];

			for (let lineNo = startLineNo; lineNo <= endLineNo; lineNo++) {
				const line = state.doc.line(lineNo);
				const text = line.text;

				if (text.includes("---")) {
					continue;
				}

				const currentTableLineIndex = tableRowIndex;
				tableRowIndex++;

				if (affectedRows.includes(currentTableLineIndex)) {
					const parts = text.split("|");
					const hasLeading = text.trim().startsWith("|");
					const arrayIndex = hasLeading ? targetColumn + 1 : targetColumn;

					parts[arrayIndex] = ` ${fillValue} `;

					changes.push({
						from: line.from,
						to: line.to,
						insert: parts.join("|"),
					});
				}
			}

			if (changes.length > 0) {
				// Dispatch updates while passing back the initial selection so the grid remains active
				cmView.dispatch({
					changes,
					selection: initialSelection,
					userEvent: "input.type",
				});
			}
		},
	});

	// Command to convert a pipe-delimited selection into a markdown table.
	// Conservative header rule: a header is only created when the line directly
	// below the first row is a `---` separator. Otherwise the header row is left
	// empty and every row becomes body (easy to delete later, hard to add later).
	// Idempotent on already well-formed tables (standard spacing passes through).
	plugin.addCommand({
		id: "convert-to-table",
		name: "Convert selection to table",
		icon: "table-2",
		editorCheckCallback: (checking: boolean, editor: Editor) => {
			const from = editor.getCursor("from");
			const to = editor.getCursor("to");
			const hasSelection = from.line !== to.line || from.ch !== to.ch;

			// First run — only show in the palette when something is selected
			if (checking) {
				return hasSelection;
			}

			if (!hasSelection) {
				console.warn("[convert-to-table] aborted: no selection");
				return;
			}

			// --- Tagged logger: accumulate diagnostics, flush once at the end ---
			const logs: string[] = [];
			const warnings: string[] = [];
			const flushLogs = () => {
				if (logs.length) console.log("[convert-to-table]\n" + logs.join("\n"));
				if (warnings.length) console.warn("[convert-to-table] warnings:\n" + warnings.join("\n"));
			};

			const startLine = Math.min(from.line, to.line);
			const endLine = Math.max(from.line, to.line);

			// Step 1 — gather the selected lines
			const rawLines: string[] = [];
			for (let i = startLine; i <= endLine; i++) {
				rawLines.push(editor.getLine(i));
			}
			logs.push(`input: ${rawLines.length} line(s), range ${startLine}-${endLine}`);

			// Step 2 — drop blank / whitespace-only lines
			const lines: string[] = [];
			let droppedBlank = 0;
			for (const l of rawLines) {
				if (l.trim() === "") {
					droppedBlank++;
				} else {
					lines.push(l);
				}
			}
			if (droppedBlank > 0) logs.push(`dropped ${droppedBlank} blank line(s)`);

			if (lines.length === 0) {
				flushLogs();
				new Notice("Nothing to convert — only empty lines");
				return;
			}

			// Step 3 — per-line cell parsing.
			// Strip ONE decorative leading `|` and ONE trailing `|`, then split on
			// unescaped `|`. `\|` is a literal pipe inside a cell. `||` yields an
			// intentional empty cell.
			const isSeparatorCell = (c: string) => /^:?-+:?$/.test(c.trim());

			const parseCells = (line: string): string[] => {
				let s = line;
				let leadingPipe = false;
				let trailingPipe = false;
				if (s.startsWith("|")) {
					s = s.slice(1);
					leadingPipe = true;
				}
				if (s.endsWith("|")) {
					s = s.slice(0, -1);
					trailingPipe = true;
				}
				if (leadingPipe || trailingPipe) {
					logs.push(
						`edge pipe stripped (leading=${leadingPipe}, trailing=${trailingPipe}): "${line}"`,
					);
				}
				// Split on `|` not preceded by `\` (keeps `\|` intact within a cell)
				const parts = s.split(/(?<!\\)\|/);
				let sawEscape = false;
				const cells = parts.map((p) => {
					if (p.includes("\\|")) sawEscape = true;
					return p.replace(/\\\|/g, "|").trim();
				});
				if (sawEscape) logs.push(`escaped pipe (\\|) treated as literal in: "${line}"`);
				return cells;
			};

			const isSeparatorLine = (line: string): boolean => {
				const cells = parseCells(line);
				return cells.length > 0 && cells.every(isSeparatorCell);
			};

			// Step 4 — separator detection & header decision.
			// Drop separator-like lines that are NOT directly below the first row,
			// so stray dashes never become a body cell.
			const cleaned: string[] = [];
			lines.forEach((l, idx) => {
				if (idx !== 1 && isSeparatorLine(l)) {
					warnings.push(`separator-like line dropped at index ${idx}: "${l}"`);
					return;
				}
				cleaned.push(l);
			});

			const hasHeader = cleaned.length >= 2 && isSeparatorLine(cleaned[1]);
			logs.push(`header detection: hasHeader=${hasHeader}`);

			let headerCells: string[] | null;
			let separatorSpec: string[] | null;
			let bodyLines: string[];

			if (hasHeader) {
				headerCells = parseCells(cleaned[0]);
				separatorSpec = parseCells(cleaned[1]).map((c) => (isSeparatorCell(c) ? c.trim() : "---"));
				bodyLines = cleaned.slice(2);
				logs.push(`header kept: ${JSON.stringify(headerCells)}`);
			} else {
				headerCells = null;
				separatorSpec = null;
				bodyLines = cleaned;
				logs.push("no header marker -> empty header, all rows are body");
			}

			// Step 5 — determine shape. Column count comes from data rows only,
			// NEVER from the separator row. Shorter rows are padded with empty cells.
			let maxCols = headerCells ? headerCells.length : 0;
			const bodyRows = bodyLines.map((l) => {
				const cells = parseCells(l);
				maxCols = Math.max(maxCols, cells.length);
				return cells;
			});
			maxCols = Math.max(maxCols, 1);
			logs.push(`maxCols=${maxCols}; body cell counts: [${bodyRows.map((r) => r.length).join(", ")}]`);

			const pad = (cells: string[]): string[] => {
				const out = cells.slice();
				while (out.length < maxCols) out.push("");
				return out;
			};

			const headerRow = headerCells ? pad(headerCells) : Array.from({ length: maxCols }, () => "");
			const bodyPadded = bodyRows.map(pad);

			// Separator cells: preserve user alignment where given, else `---`.
			const sepCells: string[] = [];
			for (let i = 0; i < maxCols; i++) {
				sepCells.push(separatorSpec && i < separatorSpec.length ? separatorSpec[i] : "---");
			}
			if (separatorSpec && separatorSpec.length !== maxCols) {
				logs.push(`separator padded/trimmed: spec had ${separatorSpec.length}, maxCols=${maxCols}`);
			}

			// Step 6 — format and apply as a single transaction (one undo step)
			const fmt = (cells: string[]) => "| " + cells.join(" | ") + " |";
			const outRows: string[] = [fmt(headerRow), fmt(sepCells), ...bodyPadded.map(fmt)];
			const table = outRows.join("\n");

			logs.push(
				`output: ${outRows.length} row(s) (header empty=${headerCells === null}, body ${bodyPadded.length})`,
			);

			editor.replaceRange(
				table,
				{ line: startLine, ch: 0 },
				{ line: endLine, ch: editor.getLine(endLine).length },
				"convert-table",
			);

			// Select the resulting table so the user can re-run / inspect easily
			const newLineCount = table.split("\n").length - 1;
			editor.setSelection(
				{ line: startLine, ch: 0 },
				{ line: startLine + newLineCount, ch: editor.getLine(startLine + newLineCount).length },
			);

			flushLogs();
		},
	});

	// Command to paste clipboard HTML as a ROUGH table draft.
	// Only rule for now: consecutive <span> siblings are treated as one row,
	// joined with ` | `. Everything else is emitted as its own line via text
	// content. This is deliberately rough — run "Convert selection to table"
	// afterwards to finish. The inserted draft is fully selected.
	plugin.addCommand({
		id: "paste-clipboard-as-rough-table",
		name: "Paste clipboard as rough table draft",
		icon: "clipboard-paste",
		editorCallback: async (editor: Editor) => {
			const logs: string[] = [];
			const warnings: string[] = [];
			const flushLogs = () => {
				if (logs.length) console.log("[paste-rough-table]\n" + logs.join("\n"));
				if (warnings.length) console.warn("[paste-rough-table] warnings:\n" + warnings.join("\n"));
			};

			// 1. Read clipboard. Prefer the HTML flavor.
			let html: string | null = null;
			let plain: string | null = null;

			try {
				// globalThis.require avoids a bare `require` (no node types loaded)
				// and keeps esbuild from trying to bundle electron.
				const electron: any = (globalThis as any).require?.("electron");
				if (electron?.clipboard) {
					html = electron.clipboard.readHTML() || null;
					plain = electron.clipboard.readText() || null;
					logs.push("clipboard read via electron");
				}
			} catch (e) {
				warnings.push("electron clipboard unavailable, falling back to navigator API");
			}

			if (!html && !plain) {
				try {
					const items = await navigator.clipboard.read();
					for (const item of items) {
						if (!html && item.types.includes("text/html")) {
							html = await (await item.getType("text/html")).text();
						}
						if (!plain && item.types.includes("text/plain")) {
							plain = await (await item.getType("text/plain")).text();
						}
					}
					logs.push("clipboard read via navigator.clipboard");
				} catch (e) {
					warnings.push("navigator.clipboard.read failed");
				}
			}

			if (!html && !plain) {
				flushLogs();
				new Notice("Clipboard is empty or could not be read");
				return;
			}

			// 2. Convert to rough rows by analyzing the DOM tree shape.
			// For each container we look at its element children:
			//  - all leaves                -> one row, the leaves are its cells
			//  - all same-shape containers -> a list of records, each its own row
			//  - anything else             -> one row, deep-flattened from all text
			// A label leaf mixed with sub-blocks is folded into the row instead of
			// being emitted as a standalone line.
			const htmlToRoughRows = (htmlString: string): string[] => {
				const doc = new DOMParser().parseFromString(htmlString, "text/html");
				const rows: string[] = [];

				const elementChildren = (node: Node): HTMLElement[] =>
					Array.from(node.childNodes).filter(
						(c): c is HTMLElement => c.nodeType === 1,
					);

				const isLeaf = (el: HTMLElement): boolean => el.children.length === 0;

				// Wrap a URL in <...> only if it contains a char that breaks bare
				// markdown link syntax (space, ")", "<", ">"). Pure syntax — never
				// alters URL characters, so no double-encoding risk.
				const wrapUrl = (url: string): string =>
					/[)\s<>]/.test(url) ? `<${url}>` : url;

				// Placeholder for inline <svg> icons — their vector data isn't kept
				// (only remote sources are ever referenced). Swap for an emoji freely.
				const SVG_PLACEHOLDER = "svg";

				// Recursive markdown for a node. Anchors -> [text](href), images ->
				// ![alt](src), inline <svg> icons -> a placeholder, other elements
				// pass through their children. So <a><img></a> -> [![alt](src)](href)
				// and an icon-only link -> [svg](href) (a visible link).
				const markdownText = (node: Node): string => {
					if (node.nodeType === 3) {
						return (node.textContent || "").replace(/\s+/g, " ");
					}
					if (node.nodeType !== 1) return "";
					const el = node as HTMLElement;
					const tag = el.tagName;
					if (tag === "svg" || tag === "SVG") return SVG_PLACEHOLDER;
					if (tag === "IMG") {
						const src = el.getAttribute("src");
						return src
							? `![${(el.getAttribute("alt") || "").trim()}](${wrapUrl(src)})`
							: "";
					}
					if (tag === "A") {
						const inner = Array.from(el.childNodes)
							.map(markdownText)
							.join("")
							.trim();
						const href = el.getAttribute("href");
						return href ? `[${inner}](${wrapUrl(href)})` : inner;
					}
					return Array.from(el.childNodes).map(markdownText).join("");
				};

				const cellText = (el: HTMLElement): string => markdownText(el).trim();

				// Structural signature (tag + child shapes) used to tell a uniform
				// list of same-shaped records from a heterogeneous record.
				const shape = (el: HTMLElement): string => {
					const kids = elementChildren(el);
					if (kids.length === 0) return el.tagName;
					return el.tagName + "[" + kids.map(shape).join(",") + "]";
				};

				// HTML element names that represent a distinct pseudo-table cell
				// (div, span, li, ul …). During deep-flatten they flush a cell
				// boundary; br/hr are separators (flush without holding data).
				// Table tags are intentionally absent — native <table> markup is
				// delegated to Obsidian. Inline elements not listed here (a, img,
				// strong, svg, …) accumulate into the surrounding cell. Add tags
				// here as you encounter new pseudo-table layouts.
				const CELL_TAGS = new Set(["DIV", "SPAN", "LI", "UL", "BR", "HR"]);

				// Deep-flatten a heterogeneous/mixed block into cells. Inline runs
				// accumulate into one cell; cell-worthy children flush and become
				// their own (br/hr just flush — no content of their own).
				const collectCells = (node: Node): string[] => {
					const out: string[] = [];
					let buf = "";
					const flush = () => {
						const t = buf.replace(/\s+/g, " ").trim();
						if (t) out.push(t);
						buf = "";
					};
					const walk = (n: Node) => {
						for (const c of Array.from(n.childNodes)) {
							if (c.nodeType === 3) {
								buf += (c.textContent || "").replace(/\s+/g, " ");
							} else if (c.nodeType === 1) {
								const el = c as HTMLElement;
								if (CELL_TAGS.has(el.tagName)) {
									flush();
									walk(el);
									flush();
								} else {
									buf += markdownText(el);
								}
							}
						}
					};
					walk(node);
					flush();
					return out;
				};

				const extract = (node: Node) => {
					const kids = elementChildren(node);
					if (kids.length === 0) return; // leaf — handled by its parent

					const allLeaves = kids.every(isLeaf);
					if (allLeaves) {
						// all leaves -> one row, leaves are the cells
						const cells = kids.map(cellText);
						if (cells.some((c) => c !== "")) rows.push(cells.join(" | "));
						return;
					}

					const allContainers = kids.every((c) => !isLeaf(c));
					if (allContainers) {
						const shapes = kids.map(shape);
						if (shapes.every((s) => s === shapes[0])) {
							// uniform record list -> each child becomes its own row
							for (const c of kids) extract(c);
						} else {
							// heterogeneous record -> one row, deep-flattened
							const cells = collectCells(node);
							if (cells.length) rows.push(cells.join(" | "));
						}
						return;
					}

					// mixed leaves + containers -> fold into one common row
					const cells = collectCells(node);
					if (cells.length) rows.push(cells.join(" | "));
				};

				extract(doc.body);
				return rows;
			};

			let lines: string[];
			if (html) {
				if (/<table[\s>]/i.test(html)) {
					// Native HTML table — let Obsidian convert it (like Ctrl/Cmd+V):
					// dispatch a synthetic paste carrying the clipboard's HTML.
					logs.push("native <table> -> Obsidian paste");
					flushLogs();
					const dt = new DataTransfer();
					dt.setData("text/html", html);
					(editor as any).cm?.contentDOM?.dispatchEvent(
						new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
					);
					return;
				}
				lines = htmlToRoughRows(html);
				logs.push(`parsed HTML -> ${lines.length} raw row(s)`);
			} else {
				lines = plain!
					.split(/\r?\n/)
					.map((l) => l.trim())
					.filter((l) => l !== "");
				logs.push(`no HTML flavor, used plain text -> ${lines.length} line(s)`);
			}

			if (lines.length === 0) {
				flushLogs();
				new Notice("Nothing convertible found in clipboard");
				return;
			}

			// 3. Insert at cursor on its own block, then SELECT all of it.
			const cursor = editor.getCursor();
			const insertText = lines.join("\n");
			const prefix = cursor.ch === 0 ? "" : "\n";
			const suffix = "\n";

			const startOffset = editor.posToOffset(cursor);
			editor.replaceRange(prefix + insertText + suffix, cursor, cursor, "paste-rough-table");

			// Selection covers exactly the inserted rows (not the padding newlines)
			const selFrom = editor.offsetToPos(startOffset + prefix.length);
			const selTo = editor.offsetToPos(startOffset + prefix.length + insertText.length);
			editor.setSelection(selFrom, selTo);

			logs.push(`inserted ${lines.length} row(s), selected`);
			flushLogs();
		},
	});

	// Command to convert a CSV selection to a markdown table.
	// Auto-detects the delimiter (comma / semicolon / tab) by column-count
	// consistency; honors RFC-4180 quoting. Conservative empty header (no
	// marker exists in CSV). When detection is ambiguous, a FuzzySuggestModal
	// lets the user pick the delimiter manually.
	plugin.addCommand({
		id: "convert-csv-to-table",
		name: "Convert CSV selection to table",
		icon: "file-spreadsheet",
		editorCheckCallback: (checking: boolean, editor: Editor) => {
			const from = editor.getCursor("from");
			const to = editor.getCursor("to");
			const hasSelection = from.line !== to.line || from.ch !== to.ch;

			if (checking) {
				return hasSelection;
			}

			if (!hasSelection) {
				console.warn("[convert-csv] aborted: no selection");
				return;
			}

			const logs: string[] = [];
			const warnings: string[] = [];
			const flushLogs = () => {
				if (logs.length) console.log("[convert-csv]\n" + logs.join("\n"));
				if (warnings.length) console.warn("[convert-csv] warnings:\n" + warnings.join("\n"));
			};

			const startLine = Math.min(from.line, to.line);
			const endLine = Math.max(from.line, to.line);

			// Gather the selection as one string (quoted cells may span lines)
			const rawLines: string[] = [];
			for (let i = startLine; i <= endLine; i++) {
				rawLines.push(editor.getLine(i));
			}
			const text = rawLines.join("\n");
			logs.push(`input: ${rawLines.length} line(s)`);

			// --- RFC-4180 CSV parser ---
			const parseCsv = (input: string, delim: string): string[][] => {
				const rows: string[][] = [];
				let row: string[] = [];
				let cell = "";
				let inQuotes = false;
				for (let i = 0; i < input.length; i++) {
					const ch = input[i];
					if (inQuotes) {
						if (ch === '"') {
							if (input[i + 1] === '"') {
								cell += '"';
								i++;
							} else {
								inQuotes = false;
							}
						} else {
							cell += ch;
						}
					} else if (ch === '"') {
						inQuotes = true;
					} else if (ch === delim) {
						row.push(cell);
						cell = "";
					} else if (ch === "\n") {
						row.push(cell);
						cell = "";
						rows.push(row);
						row = [];
					} else if (ch !== "\r") {
						cell += ch;
					}
				}
				row.push(cell);
				rows.push(row);
				return rows;
			};

			// --- delimiter auto-detection ---
			const candidateDefs = [
				{ delim: ",", label: "Comma  ," },
				{ delim: ";", label: "Semicolon  ;" },
				{ delim: "\t", label: "Tab  ⇥" },
				{ delim: "|", label: "Pipe  |" },
			];

			const analyze = (input: string, delim: string) => {
				// Drop pure empty-line rows so a trailing newline can't skew the
				// column-count stats (a common cause of misdetection on TSV/CSV).
				const rows = parseCsv(input, delim).filter((r) => !(r.length === 1 && r[0] === ""));
				const counts = rows.map((r) => r.length);
				const freq: Record<number, number> = {};
				for (const c of counts) freq[c] = (freq[c] || 0) + 1;
				let modalCols = 0;
				let modalFreq = 0;
				for (const k in freq) {
					if (freq[k] > modalFreq) {
						modalFreq = freq[k];
						modalCols = Number(k);
					}
				}
				const consistency = counts.length ? modalFreq / counts.length : 0;
				return { rows, modalCols, consistency };
			};

			const analyzed = candidateDefs.map((c) => ({ ...c, ...analyze(text, c.delim) }));
			for (const a of analyzed) {
				logs.push(
					`candidate ${JSON.stringify(a.delim)}: modalCols=${a.modalCols}, consistency=${a.consistency.toFixed(2)}`,
				);
			}

			// Strong-willed detection: a candidate "splits" if its most common
			// row width is >= 2. If EXACTLY ONE candidate splits, trust it — a
			// single ragged row no longer forces the picker. Only when several
			// plausibly split (real ambiguity) do we ask the user.
			const splitting = analyzed.filter((a) => a.modalCols >= 2);
			const isConfident = splitting.length === 1;
			const confidentPick = splitting[0];

			// Sanitize a cell for markdown-table output: trim, escape literal
			// pipes (`|` -> `\|`, which the pipe converter understands), and turn
			// embedded newlines (from quoted multi-line cells) into `<br>`.
			const sanitize = (c: string): string => {
				let s = c.trim();
				if (s.includes("\n")) {
					warnings.push("cell contained newline -> converted to <br>");
					s = s.replace(/\r?\n/g, "<br>");
				}
				if (s.includes("|")) {
					warnings.push("cell contained pipe -> escaped to \\|");
					s = s.replace(/\|/g, "\\|");
				}
				return s;
			};

			const buildAndApply = (delim: string, rowsRaw: string[][]) => {
				logs.push(`using delimiter ${JSON.stringify(delim)}`);
				const rows = rowsRaw.map((r) => r.map(sanitize)).filter((r) => !r.every((c) => c === ""));

				if (rows.length === 0) {
					flushLogs();
					new Notice("Nothing to convert — only empty rows");
					return;
				}

				let maxCols = 1;
				for (const r of rows) maxCols = Math.max(maxCols, r.length);
				logs.push(`output: ${rows.length} body row(s), maxCols=${maxCols}, empty header`);

				const pad = (cells: string[]): string[] => {
					const out = cells.slice();
					while (out.length < maxCols) out.push("");
					return out;
				};
				const headerRow = Array.from({ length: maxCols }, () => "");
				const sepCells = Array.from({ length: maxCols }, () => "---");
				const fmt = (cells: string[]) => "| " + cells.join(" | ") + " |";
				const table = [fmt(headerRow), fmt(sepCells), ...rows.map((r) => fmt(pad(r)))].join("\n");

				editor.replaceRange(
					table,
					{ line: startLine, ch: 0 },
					{ line: endLine, ch: editor.getLine(endLine).length },
					"convert-csv-table",
				);

				const newLineCount = table.split("\n").length - 1;
				editor.setSelection(
					{ line: startLine, ch: 0 },
					{ line: startLine + newLineCount, ch: editor.getLine(startLine + newLineCount).length },
				);
				flushLogs();
			};

			if (isConfident && confidentPick) {
				buildAndApply(confidentPick.delim, confidentPick.rows);
			} else if (splitting.length === 0) {
				// No delimiter splits the text at all -> single-column table.
				logs.push("no delimiter split the text -> single-column table");
				buildAndApply(",", analyzed[0].rows);
			} else {
				// Ambiguous / low confidence -> let the user pick the delimiter.
				// Rank options by detected columns then consistency (best first).
				logs.push(
					`not confident (splitting candidates: ${splitting.length}) -> opening delimiter picker`,
				);
				flushLogs();
				logs.length = 0;
				warnings.length = 0;
				const ranked = [...analyzed].sort(
					(a, b) => b.modalCols - a.modalCols || b.consistency - a.consistency,
				);
				new CsvDelimiterSuggestModal(
					plugin.app,
					ranked.map((a) => ({
						delim: a.delim,
						label: a.label,
						cols: a.modalCols,
						rows: a.rows.length,
					})),
					(chosen: string) => {
						const pick = analyzed.find((a) => a.delim === chosen);
						if (pick) buildAndApply(chosen, pick.rows);
					},
				).open();
			}
		},
	});
}
