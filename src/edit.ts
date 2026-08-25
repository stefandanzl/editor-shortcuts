import { Editor, Notice } from "obsidian";
import EditorShortcutsPlugin from "./main";
import { getSelectedLineRange } from "./utils";
import { EditorView } from "@codemirror/view";

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

	// Command to select the entire current line (or all lines spanned by the
	// current selection) — for cutting/deleting/copying a whole line at once.
	plugin.addCommand({
		id: "select-line",
		name: "Select entire current line",
		icon: "text-cursor",
		editorCallback: (editor: Editor) => {
			const { startLine, endLine } = getSelectedLineRange(editor);
			editor.setSelection(
				{ line: startLine, ch: 0 },
				{ line: endLine, ch: editor.getLine(endLine).length },
			);
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
