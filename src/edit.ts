import { Editor, EditorPosition, Notice } from "obsidian";
import EditorShortcutsPlugin from "./main";
import { getSelectedLineRange } from "./utils";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

// Move the current line (or the whole selected line block) one line up or
// down. Shared by the move-line-up / move-line-down commands.
function moveLine(editor: Editor, dir: "up" | "down") {
	const { hasMultiLineSelection, startLine, endLine } = getSelectedLineRange(editor);
	const lastLine = editor.lineCount() - 1;

	if (hasMultiLineSelection) {
		if ((dir === "up" && startLine === 0) || (dir === "down" && endLine === lastLine)) return;

		const selectedLines: string[] = [];
		for (let i = startLine; i <= endLine; i++) selectedLines.push(editor.getLine(i));

		const replaceFrom = dir === "up" ? startLine - 1 : startLine;
		const replaceTo = dir === "up" ? endLine : endLine + 1;
		const neighbor = editor.getLine(dir === "up" ? startLine - 1 : endLine + 1);
		const newContent =
			dir === "up"
				? selectedLines.join("\n") + "\n" + neighbor
				: neighbor + "\n" + selectedLines.join("\n");

		editor.replaceRange(
			newContent,
			{ line: replaceFrom, ch: 0 },
			{ line: replaceTo, ch: editor.getLine(replaceTo).length },
			"move-line",
		);

		const shift = dir === "up" ? -1 : 1;
		editor.setSelection(
			{ line: startLine + shift, ch: 0 },
			{ line: endLine + shift, ch: editor.getLine(endLine + shift).length },
		);
		return;
	}

	// single line: swap text with the neighbour, move the cursor along
	const cursor = editor.getCursor();
	const line = cursor.line;
	if ((dir === "up" && line === 0) || (dir === "down" && line === lastLine)) return;
	const swapWith = dir === "up" ? line - 1 : line + 1;
	const cur = editor.getLine(line);
	const other = editor.getLine(swapWith);
	editor.replaceRange(other, { line, ch: 0 }, { line, ch: editor.getLine(line).length }, "move-line");
	editor.replaceRange(
		cur,
		{ line: swapWith, ch: 0 },
		{ line: swapWith, ch: editor.getLine(swapWith).length },
		"move-line",
	);
	editor.setCursor({ line: swapWith, ch: cursor.ch });
}

// Paragraph = contiguous non-blank lines around the given line range, SCOPED
// to the content of the innermost heading section (from the CM AST): the
// scan is bounded by the section, so it can never cross a heading line.
const getParagraphRange = (editor: Editor, startLine: number, endLine: number) => {
	if (editor.getLine(startLine).trim() === "" && editor.getLine(endLine).trim() === "") {
		return {
			from: { line: startLine, ch: 0 },
			to: { line: endLine, ch: editor.getLine(endLine).length },
		};
	}
	// section content = after the section's own heading line, to the section end
	const inner = getSectionRanges(editor, startLine, endLine)[0];
	const lower = inner ? inner.from.line + 1 : 0;
	const upper = inner ? inner.to.line : editor.lineCount() - 1;

	let s = startLine;
	while (s > lower && editor.getLine(s - 1).trim() !== "") s--;
	let e = endLine;
	while (e < upper && editor.getLine(e + 1).trim() !== "") e++;
	return { from: { line: s, ch: 0 }, to: { line: e, ch: editor.getLine(e).length } };
};

// Real parsed headings from the CM syntax tree — a "#" line inside a code
// block is NOT a heading here. Node names carry the level (header-2 etc.).
// Returns null if the CM view is unreachable (then the regex fallback runs).
const getHeadings = (editor: Editor): { level: number; line: number }[] | null => {
	const view = editor.cm;
	if (!view) return null;
	const doc = view.state.doc;
	const headings: { level: number; line: number }[] = [];
	syntaxTree(view.state).iterate({
		from: 0,
		to: doc.length,
		enter: (node) => {
			const m = typeof node.name === "string" ? node.name.match(/header-([1-6])/) : null;
			if (!m) return true;
			const line = doc.lineAt(node.from).number - 1;
			// parents enter before children: the first header node per line is
			// the line-level one, skip its inline children
			if (headings.length && headings[headings.length - 1].line === line) return false;
			headings.push({ level: Number(m[1]), line });
			return false;
		},
	});
	return headings;
};

// All heading sections containing the given line range, innermost first:
// nearest heading section -> parent heading section -> ... up the hierarchy.
const getSectionRanges = (editor: Editor, startLine: number, endLine: number): Range[] => {
	const headings = getHeadings(editor);
	const ranges: Range[] = [];
	if (!headings) {
		console.error("NO HEADINGS!!! FALLBACK!!!!");
		return ranges;
	}

	const last = editor.lineCount() - 1;
	// closest heading at-or-above first (innermost), then its ancestors
	for (let i = headings.length - 1; i >= 0; i--) {
		const h = headings[i];
		if (h.line > startLine) continue;
		let e = last;
		for (let j = i + 1; j < headings.length; j++) {
			if (headings[j].level <= h.level) {
				e = headings[j].line - 1;
				break;
			}
		}
		if (e < endLine) continue; // section doesn't contain us
		ranges.push({ from: { line: h.line, ch: 0 }, to: { line: e, ch: editor.getLine(e).length } });
	}
	return ranges;
};

const eqPos = (a: EditorPosition, b: EditorPosition) => a.line === b.line && a.ch === b.ch;

const posBefore = (a: EditorPosition, b: EditorPosition) =>
	a.line < b.line || (a.line === b.line && a.ch < b.ch);

const containsStrictly = (outer: Range, inner: Range) =>
	(posBefore(outer.from, inner.from) || eqPos(outer.from, inner.from)) &&
	(posBefore(inner.to, outer.to) || eqPos(inner.to, outer.to)) &&
	(posBefore(outer.from, inner.from) || posBefore(inner.to, outer.to));

// setSelection WITHOUT scrolling: a raw CM dispatch carries no scrollIntoView,
// so the viewport stays exactly where it is.
const setSelectionNoScroll = (editor: Editor, from: EditorPosition, to: EditorPosition) => {
	const view = editor.cm;
	if (!view) {
		editor.setSelection(from, to);
		return;
	}
	const at = (p: EditorPosition) => view.state.doc.line(p.line + 1).from + p.ch;
	view.dispatch({ selection: { anchor: at(from), head: at(to) } });
};

type Range = { from: EditorPosition; to: EditorPosition };

// Cycle state for expand-selection: the selection the cycle started from and
// the range the last invocation set. The cycle only continues while the
// current selection still equals `last` — any manual cursor change breaks the
// equality and the next press starts a fresh cycle.
let expandState: { original: Range; last: Range; level: number } | null = null;

export async function registerBasicCommands(plugin: EditorShortcutsPlugin) {
	// Command to move the current line up
	plugin.addCommand({
		id: "move-line-up",
		name: "Move current line up",
		icon: "arrow-up-from-line",
		repeatable: true,
		hotkeys: [
			{
				modifiers: ["Alt"],
				key: "ArrowUp",
			},
		],
		editorCallback: (editor: Editor) => moveLine(editor, "up"),
	});

	// Command to move the current line down
	plugin.addCommand({
		id: "move-line-down",
		name: "Move current line down",
		icon: "arrow-down-from-line",
		repeatable: true,
		hotkeys: [
			{
				modifiers: ["Alt"],
				key: "ArrowDown",
			},
		],
		editorCallback: (editor: Editor) => moveLine(editor, "down"),
	});

	plugin.addCommand({
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
	plugin.addCommand({
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
					editor.replaceRange("", { line: line, ch: 0 }, { line: line + 1, ch: 0 }, "delete-line");
				}
			}
		},
	});

	plugin.addCommand({
		id: "select-word",
		name: "Select word at cursor",
		icon: "whole-word",
		editorCallback: (editor: Editor) => {
			const word = editor.wordAt(editor.getCursor("from"));
			if (word) setSelectionNoScroll(editor, word.from, word.to);
		},
	});

	// Command to select the entire current line (or all lines spanned by the
	// current selection) — for cutting/deleting/copying a whole line at once.
	plugin.addCommand({
		id: "select-line",
		name: "Select entire current line",
		icon: "text-cursor",
		editorCallback: (editor: Editor) => {
			const { startLine, endLine } = getSelectedLineRange(editor);
			setSelectionNoScroll(
				editor,
				{ line: startLine, ch: 0 },
				{ line: endLine, ch: editor.getLine(endLine).length },
			);
		},
	});

	plugin.addCommand({
		id: "select-paragraph",
		name: "Select paragraph",
		icon: "pilcrow",
		editorCallback: (editor: Editor) => {
			const { startLine, endLine } = getSelectedLineRange(editor);
			const p = getParagraphRange(editor, startLine, endLine);
			setSelectionNoScroll(editor, p.from, p.to);
		},
	});

	plugin.addCommand({
		id: "select-section",
		name: "Select section",
		icon: "heading",
		editorCallback: (editor: Editor) => {
			const { startLine, endLine } = getSelectedLineRange(editor);
			const s = getSectionRanges(editor, startLine, endLine)[0];
			if (s) setSelectionNoScroll(editor, s.from, s.to);
		},
	});

	// Cascading expand: word -> line -> paragraph -> all -> back to the
	// original selection, as a continuous cycle. Anchors stay fixed at the
	// selection the cycle started from; any manual cursor change restarts it.
	plugin.addCommand({
		id: "expand-selection",
		name: "Expand selection (word → line → paragraph → all)",
		icon: "text-select",
		editorCallback: (editor: Editor) => {
			const cur: Range = { from: editor.getCursor("from"), to: editor.getCursor("to") };

			let state = expandState;
			if (state === null || !eqPos(state.last.from, cur.from) || !eqPos(state.last.to, cur.to)) {
				state = { original: cur, last: cur, level: -1 };
			}
			const o = state.original;

			// level ladder, anchored at the cycle's original selection
			const levels: Range[] = [];
			const word = editor.wordAt(o.from);
			if (word) levels.push({ from: word.from, to: word.to });
			levels.push({
				from: { line: o.from.line, ch: 0 },
				to: { line: o.to.line, ch: editor.getLine(o.to.line).length },
			});
			levels.push(getParagraphRange(editor, o.from.line, o.to.line));
			levels.push(...getSectionRanges(editor, o.from.line, o.to.line));
			const lastLine = editor.lineCount() - 1;
			levels.push({
				from: { line: 0, ch: 0 },
				to: { line: lastLine, ch: editor.getLine(lastLine).length },
			});

			// advance to the next level that STRICTLY grows the selection
			// (skips duplicates and levels the selection already covers; also
			// handles a fresh cycle or the wrap, where level = -1). Exhausted
			// -> wrap back to the original selection.
			let nextIdx = state.level + 1;
			while (nextIdx < levels.length && !containsStrictly(levels[nextIdx], cur)) {
				nextIdx++;
			}
			const wrapped = nextIdx >= levels.length;
			const target = wrapped ? o : levels[nextIdx];
			setSelectionNoScroll(editor, target.from, target.to);
			// store the READ-BACK selection: Live Preview clamps selections
			// around atomic ranges (e.g. the properties block), so what the
			// editor actually stores can differ from what we requested
			expandState = {
				original: o,
				last: { from: editor.getCursor("from"), to: editor.getCursor("to") },
				level: wrapped ? -1 : nextIdx,
			};
			console.log("[expand] level", nextIdx, "wrapped", wrapped, "stored", expandState.last);
		},
	});

	// Simulate Shift+Enter — for mobile, where the on-screen keyboard can't
	// send it. Context-aware: <br> inside a table, indented continuation for
	// list/checkbox/numbered items, else keep the line's leading indent.
	plugin.addCommand({
		id: "simulate-shift-enter",
		name: "Simulate Shift+Enter",
		icon: "corner-down-right",
		editorCallback: (editor) => {
			// Rendered table widget: the cell is its own CodeMirror editor, so
			// edit THAT one. Editing the main source while a cell is open
			// desyncs the two docs ("wrong length" errors) and leaves <br> as
			// literal text. A newline in the cell editor renders as a line break
			// and the widget writes <br> to source — native, no refresh needed.
			const cellEl = (document.activeElement as HTMLElement | null)?.closest(
				".cm-table-widget .cm-editor",
			) as HTMLElement | null;
			if (cellEl) {
				const view = EditorView.findFromDOM(cellEl);
				if (view) {
					view.dispatch(view.state.replaceSelection("\n"));
					view.focus();
					return;
				}
			}

			// Source mode below.
			const lineText = editor.getLine(editor.getCursor().line);

			// Table row in source: <br> so the row isn't split.
			const isTable =
				lineText.trim().startsWith("|") || (lineText.includes("|") && lineText.trim().endsWith("|"));
			if (isTable) {
				const from = editor.getCursor("from");
				editor.replaceSelection("<br>");
				editor.setCursor({ line: from.line, ch: from.ch + 4 }); // after <br>
				return;
			}

			// List / checkbox: indent to the item's content position. Keep the
			// leading whitespace VERBATIM (tabs or spaces, however many) and pad
			// only the marker width with spaces.
			const listMatch = lineText.match(/^(\s*(?:[-+*]|\d+\.)\s*(?:\[[ xX]\]\s*)?)/);
			if (listMatch) {
				const prefix = listMatch[1];
				const leadingWs = /^\s*/.exec(prefix)?.[0] ?? "";
				editor.replaceSelection("\n" + leadingWs + " ".repeat(prefix.length - leadingWs.length));
				return;
			}

			// Plain text: keep the current line's leading indent.
			editor.replaceSelection("\n" + (lineText.match(/^\s*/)?.[0] ?? ""));
		},
	});

	// Command to paste image URL as markdown with filename as alt text
	plugin.addCommand({
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
