import { Plugin, Editor, MarkdownView, Notice, EditorPosition } from "obsidian";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

const REPLACEMENTS = [
	{ trigger: "-->", replacement: "\u{27F6}" },
	{ trigger: "<--", replacement: "\u{27F5}" },
];

const replacementExtension = EditorView.inputHandler.of((view, from, to, text) => {
	if (text.length !== 1) return false;

	for (const r of REPLACEMENTS) {
		const lastChar = r.trigger.slice(-1);
		const prefix = r.trigger.slice(0, -1);

		if (text !== lastChar) continue;
		if (from < prefix.length) continue;

		const before = view.state.doc.sliceString(from - prefix.length, from);
		if (before !== prefix) continue;

		// Code-Kontext skippen
		const node = syntaxTree(view.state).resolveInner(from, -1);
		let n: any = node;
		while (n) {
			if (n.name.toLowerCase().includes("code")) return false;
			n = n.parent;
		}

		// Replacement asynchron als separate Transaction
		// (nach dem normalen Input-Insert)
		queueMicrotask(() => {
			// Position neu berechnen — könnte sich verschoben haben
			const replaceFrom = from - prefix.length;
			const replaceTo = from + 1; // +1 weil das getippte Zeichen jetzt drin ist

			view.dispatch({
				changes: { from: replaceFrom, to: replaceTo, insert: r.replacement },
				userEvent: "input.replace",
			});
		});

		return false; // false = Input normal verarbeiten lassen
	}
	return false;
});

export default class EditorShortcutsPlugin extends Plugin {
	async onload() {
		// Register the arrow symbol replacement extension
		this.registerEditorExtension(replacementExtension);

		// Helper function to get selected line range
		const getSelectedLineRange = (editor: Editor) => {
			const from = editor.getCursor("from");
			const to = editor.getCursor("to");
			return {
				hasMultiLineSelection: from.line !== to.line,
				startLine: Math.min(from.line, to.line),
				endLine: Math.max(from.line, to.line),
				from,
				to,
			};
		};

		this.addCommand({
			id: "duplicate-line",
			name: "Duplicate current line or selection",
			icon: "layers-2",
			hotkeys: [
				{
					modifiers: ["Ctrl", "Shift"],
					key: "D",
				},
			],
			editorCallback: (editor: Editor) => {
				// 1. Start- und Endpunkt der aktuellen Auswahl holen
				const from = editor.getCursor("from");
				const to = editor.getCursor("to");

				// Handelt es sich um eine Multiline-Auswahl?
				const isMultiline = from.line !== to.line;

				if (isMultiline) {
					// --- MULTILINE LOGIK ---
					const startLine = from.line;
					const endLine = to.line;

					// Alle Zeilen des Blocks einsammeln
					const lines: string[] = [];
					for (let i = startLine; i <= endLine; i++) {
						lines.push(editor.getLine(i));
					}
					const blockText = lines.join("\n");

					// Text am Ende der letzten selektierten Zeile einfügen
					const endOfTargetLine = editor.getLine(endLine).length;
					const insertPos = { line: endLine, ch: endOfTargetLine };

					editor.replaceRange("\n" + blockText, insertPos);

					// Optionale Kür: Die Auswahl auf den neuen Block verschieben (wie in VS Code)
					const lineOffset = endLine - startLine + 1;
					editor.setSelection(
						{ line: from.line + lineOffset, ch: from.ch },
						{ line: to.line + lineOffset, ch: to.ch },
					);
				} else {
					// --- SINGLE LINE LOGIK (Deine optimierte Version) ---
					const lineText = editor.getLine(from.line);
					const endOfLine = { line: from.line, ch: lineText.length };

					editor.replaceRange("\n" + lineText, endOfLine);

					// Cursor in die neue Zeile setzen
					editor.setCursor({
						line: from.line + 1,
						ch: from.ch,
					});
				}
			},
		});

		// Command to delete the current line
		this.addCommand({
			id: "delete-current-line",
			name: "Delete current line",
			icon: "delete",
			hotkeys: [
				{
					modifiers: ["Ctrl", "Shift"],
					key: "Backspace",
				},
			],
			editorCallback: (editor: Editor) => {
				const { hasMultiLineSelection, startLine, endLine } = getSelectedLineRange(editor);

				if (hasMultiLineSelection) {
					// Delete multiple lines
					const lastLine = editor.lineCount() - 1;

					if (endLine === lastLine) {
						// If deleting lines at the end, also delete the newline before them
						const startCh = startLine > 0 ? editor.getLine(startLine - 1).length : 0;
						const startDeleteLine = startLine > 0 ? startLine - 1 : startLine;
						const endLineText = editor.getLine(endLine);

						editor.replaceRange(
							"",
							{ line: startDeleteLine, ch: startCh },
							{ line: endLine, ch: endLineText.length },
							"delete-line",
						);
					} else {
						// Delete from start of first line to start of line after last line
						editor.replaceRange(
							"",
							{ line: startLine, ch: 0 },
							{ line: endLine + 1, ch: 0 },
							"delete-line",
						);
					}

					// Position cursor at the start of where deletion happened
					editor.setCursor({ line: startLine, ch: 0 });
				} else {
					// Single line deletion (original logic)
					const cursor = editor.getCursor();
					const line = cursor.line;
					const lineText = editor.getLine(line);

					// Delete the entire line
					editor.replaceRange(
						"",
						{ line: line, ch: 0 },
						{ line: line, ch: lineText.length },
						"delete-line",
					);

					// Delete the new line character
					if (line < editor.lineCount() - 1) {
						editor.replaceRange(
							"",
							{ line: line, ch: 0 },
							{ line: line + 1, ch: 0 },
							"delete-line",
						);
					}
				}
			},
		});

		// Command to move the current line up
		this.addCommand({
			id: "move-line-up",
			name: "Move current line up",
			icon: "arrow-up-from-line",
			hotkeys: [
				{
					modifiers: ["Alt"],
					key: "ArrowUp",
				},
			],
			editorCallback: (editor: Editor) => {
				const { hasMultiLineSelection, startLine, endLine } = getSelectedLineRange(editor);

				if (hasMultiLineSelection) {
					// Move multiple lines up
					if (startLine === 0) return; // Can't move up from first line

					// Extract the line above the selection
					const lineAbove = editor.getLine(startLine - 1);

					// Extract all selected lines
					const selectedLines: string[] = [];
					for (let i = startLine; i <= endLine; i++) {
						selectedLines.push(editor.getLine(i));
					}

					// Replace the range: selected lines, then line above
					const newContent = selectedLines.join("\n") + "\n" + lineAbove;
					editor.replaceRange(
						newContent,
						{ line: startLine - 1, ch: 0 },
						{ line: endLine, ch: editor.getLine(endLine).length },
						"move-line",
					);

					// Restore selection, shifted up by 1
					editor.setSelection(
						{ line: startLine - 1, ch: 0 },
						{
							line: endLine - 1,
							ch: editor.getLine(endLine - 1).length,
						},
					);
				} else {
					// Single line move (original logic)
					const cursor = editor.getCursor();
					const line = cursor.line;

					if (line > 0) {
						const currentLineText = editor.getLine(line);
						const prevLineText = editor.getLine(line - 1);

						// Replace the previous line with the current line
						editor.replaceRange(
							currentLineText,
							{ line: line - 1, ch: 0 },
							{ line: line - 1, ch: prevLineText.length },
							"move-line",
						);

						// Replace the current line with the previous line
						editor.replaceRange(
							prevLineText,
							{ line: line, ch: 0 },
							{ line: line, ch: currentLineText.length },
							"move-line",
						);

						// Move the cursor up a line while maintaining the same column position
						editor.setCursor({ line: line - 1, ch: cursor.ch });
					}
				}
			},
		});

		// Command to move the current line down
		this.addCommand({
			id: "move-line-down",
			name: "Move current line down",
			icon: "arrow-down-from-line",
			hotkeys: [
				{
					modifiers: ["Alt"],
					key: "ArrowDown",
				},
			],
			editorCallback: (editor: Editor) => {
				const { hasMultiLineSelection, startLine, endLine } = getSelectedLineRange(editor);

				if (hasMultiLineSelection) {
					// Move multiple lines down
					const lastLine = editor.lineCount() - 1;
					if (endLine === lastLine) return; // Can't move down from last line

					// Extract all selected lines
					const selectedLines: string[] = [];
					for (let i = startLine; i <= endLine; i++) {
						selectedLines.push(editor.getLine(i));
					}

					// Extract the line below the selection
					const lineBelow = editor.getLine(endLine + 1);

					// Replace the range: line below, then selected lines
					const newContent = lineBelow + "\n" + selectedLines.join("\n");
					editor.replaceRange(
						newContent,
						{ line: startLine, ch: 0 },
						{
							line: endLine + 1,
							ch: editor.getLine(endLine + 1).length,
						},
						"move-line",
					);

					// Restore selection, shifted down by 1
					editor.setSelection(
						{ line: startLine + 1, ch: 0 },
						{
							line: endLine + 1,
							ch: editor.getLine(endLine + 1).length,
						},
					);
				} else {
					// Single line move (original logic)
					const cursor = editor.getCursor();
					const line = cursor.line;

					if (line < editor.lineCount() - 1) {
						const currentLineText = editor.getLine(line);
						const nextLineText = editor.getLine(line + 1);

						// Replace the next line with the current line
						editor.replaceRange(
							currentLineText,
							{ line: line + 1, ch: 0 },
							{ line: line + 1, ch: nextLineText.length },
							"move-line",
						);

						// Replace the current line with the next line
						editor.replaceRange(
							nextLineText,
							{ line: line, ch: 0 },
							{ line: line, ch: currentLineText.length },
							"move-line",
						);

						// Move the cursor down a line while maintaining the same column position
						editor.setCursor({ line: line + 1, ch: cursor.ch });
					}
				}
			},
		});

		// Command to remove extra double newlines
		this.addCommand({
			id: "remove-extra-newlines",
			name: "Remove extra newlines after pasting",
			icon: "chevrons-down-up",

			editorCheckCallback: (checking: boolean, editor: Editor) => {
				const { hasMultiLineSelection, startLine, endLine } = getSelectedLineRange(editor);

				if (checking) {
					// First run - check if command should appear in palette
					return hasMultiLineSelection;
				}

				if (!hasMultiLineSelection) {
					console.error(
						"This should not be happening: hasMultiLineSelection =" + hasMultiLineSelection,
					);
					return; // Do nothing if no multi-line selection
				}

				// Extract all selected lines
				const selectedLines: string[] = [];
				for (let i = startLine; i <= endLine; i++) {
					selectedLines.push(editor.getLine(i));
				}

				let processedText = selectedLines.join("\n").replace(/\n[ \t]*\n(?!#|---)/g, "\n");
				processedText = processedText.replace(/\n\n[ \t]*---[ \t]*\n/g, "\n\n");

				// Replace the selected text with the processed text
				editor.replaceRange(
					processedText,
					{ line: startLine, ch: 0 },
					{ line: endLine, ch: editor.getLine(endLine).length },
					"remove-newlines",
				);
			},
		});

		// Command to toggle both sidebars
		this.addCommand({
			id: "toggle-both-sidebars",
			name: "Toggle both sidebars",
			icon: "columns-3",
			hotkeys: [
				{
					modifiers: ["Ctrl"],
					key: "B",
				},
			],
			callback: () => {
				const { leftSplit, rightSplit } = this.app.workspace;

				// If either one is open, close them both.
				// Otherwise (if both are closed), open them both.
				const shouldCloseAll = !leftSplit.collapsed || !rightSplit.collapsed;

				if (shouldCloseAll) {
					leftSplit.collapse();
					rightSplit.collapse();
				} else {
					leftSplit.expand();
					rightSplit.expand();
				}
			},
		});

		this.addCommand({
			id: "cycle-bullet-style",
			name: "Cycle bullet style (Selection-aware)",
			icon: "list-bullets",
			editorCallback: (editor: Editor) => {
				const from = editor.getCursor("from");
				const to = editor.getCursor("to");

				const startLine = from.line;
				const endLine = to.line;

				// 1. Determine the target style based on the FIRST line
				const firstLine = editor.getLine(startLine);
				const firstLineMatch = firstLine.match(/^(\s*)([-+*])(\s)/);

				let targetMarker: "-" | "+" | "*" | "none" = "-";

				if (firstLineMatch) {
					const [, , marker] = firstLineMatch;
					const content = firstLine.slice(firstLineMatch[0].length);
					const isCheckbox = content.match(/^\[[ x]\]\s*/);

					if (isCheckbox) {
						targetMarker = "-"; // Reset checklist back to normal bullet
					} else if (marker === "-") {
						targetMarker = "+";
					} else if (marker === "+") {
						targetMarker = "*";
					} else if (marker === "*") {
						targetMarker = "none";
					}
				}

				// 2. Build the transformed block in memory first, so we can apply it
				//    as a SINGLE replaceRange — one transaction = one undo step for
				//    the whole multi-line change (instead of one undo per line).
				const newLines: string[] = [];
				for (let i = startLine; i <= endLine; i++) {
					const line = editor.getLine(i);
					const match = line.match(/^(\s*)([-+*])(\s)/);

					if (!match) {
						// Line has no bullet yet
						if (targetMarker !== "none") {
							const indentMatch = line.match(/^(\s*)/);
							const indent = indentMatch ? indentMatch[1] : "";
							const content = line.trim();
							newLines.push(
								content ? `${indent}${targetMarker} ${content}` : `${indent}${targetMarker} `,
							);
						} else {
							newLines.push(line);
						}
					} else {
						// Line has an existing bullet
						const [, indent, , space] = match;
						let content = line.slice(match[0].length);

						// Strip checkboxes if we hit them
						const checkboxMatch = content.match(/^(\[[ x]\]\s*)(.*)/s);
						if (checkboxMatch) {
							content = checkboxMatch[2];
						}

						if (targetMarker === "none") {
							// Strip the bullet entirely
							newLines.push(`${indent}${content}`);
						} else {
							// Update to the synchronized marker
							newLines.push(`${indent}${targetMarker}${space}${content}`);
						}
					}
				}

				// 3. Apply the whole block atomically
				editor.replaceRange(
					newLines.join("\n"),
					{ line: startLine, ch: 0 },
					{ line: endLine, ch: editor.getLine(endLine).length },
					"cycle-bullet",
				);

				// 4. Keep the selection intact so the user can just hit the shortcut again
				editor.setSelection(
					{ line: startLine, ch: 0 },
					{ line: endLine, ch: editor.getLine(endLine).length },
				);
			},
		});

		// Command to fill selected vertical table cells (Excel-style behavior)
		this.addCommand({
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
		this.addCommand({
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
						logs.push(`edge pipe stripped (leading=${leadingPipe}, trailing=${trailingPipe}): "${line}"`);
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
					separatorSpec = parseCells(cleaned[1]).map((c) =>
						isSeparatorCell(c) ? c.trim() : "---",
					);
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
				logs.push(
					`maxCols=${maxCols}; body cell counts: [${bodyRows.map((r) => r.length).join(", ")}]`,
				);

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

		// Command to paste image URL as markdown with filename as alt text
		this.addCommand({
			id: "embed-image-url",
			name: "Embed image URL from clipboard",
			icon: "image",
			editorCallback: async (editor: Editor) => {
				try {
					// Read from clipboard
					const clipboardText = await navigator.clipboard.readText();
					const url = clipboardText.trim();

					// Check if it looks like a URL
					if (!url.match(/^https?:\/\//i)) {
						new Notice("Clipboard doesn't contain a valid URL");
						return;
					}

					// Extract filename from URL
					const urlObj = new URL(url);
					const pathname = urlObj.pathname;
					const filenameWithExt = pathname.split("/").pop() || "image";

					// Remove file extension
					const filename = filenameWithExt.replace(/\.[^/.]+$/, "");

					// Format as markdown image
					const markdownImage = `![${filename}](${url})`;

					// Insert at cursor position
					const cursor = editor.getCursor();
					// Without a third value replaceRange moves the cursor to the end
					editor.replaceRange(markdownImage, cursor);
				} catch (error) {
					new Notice("Failed to read clipboard: " + error.message);
				}
			},
		});
	}
}
