import { Plugin, Editor, MarkdownView, Notice } from "obsidian";
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

				// 2. Apply this synchronized target style to ALL selected lines
				for (let i = startLine; i <= endLine; i++) {
					const line = editor.getLine(i);
					const match = line.match(/^(\s*)([-+*])(\s)/);

					if (!match) {
						// Line has no bullet yet
						if (targetMarker !== "none") {
							const indentMatch = line.match(/^(\s*)/);
							const indent = indentMatch ? indentMatch[1] : "";
							const content = line.trim();
							const newLine = content
								? `${indent}${targetMarker} ${content}`
								: `${indent}${targetMarker} `;
							editor.setLine(i, newLine);
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
							editor.setLine(i, `${indent}${content}`);
						} else {
							// Update to the synchronized marker
							editor.setLine(i, `${indent}${targetMarker}${space}${content}`);
						}
					}
				}

				// 3. Keep the selection intact so the user can just hit the shortcut again
				editor.setSelection(
					{ line: startLine, ch: 0 },
					{ line: endLine, ch: editor.getLine(endLine).length },
				);
			},
		});

		// Command to fill selected vertical table cells with the value of the topmost cell
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

				// 1. Fetch selected cells directly from the Live Preview UI
				const selectedCells = Array.from(
					containerEl.querySelectorAll<HTMLElement>(".cm-embed-block .is-selected"),
				);

				if (selectedCells.length < 2) {
					new Notice("Please select at least two vertical cells!");
					return;
				}

				// 2. Gather data about the selection (column and row indices)
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

				// Map affected data rows (Index + 1 to account for the markdown assignment shift)
				const affectedRows = cellData.map((c) => c.rowIndex + 1);

				// 3. Locate the corresponding lines in the code document
				const cmView = (editor as any).cm;
				if (!cmView) return;

				const state = cmView.state;
				const head = state.selection.main.head;
				const currentLine = state.doc.lineAt(head);

				// Find the start of the table in the markdown text
				let startLineNo = currentLine.number;
				while (startLineNo > 1 && state.doc.line(startLineNo - 1).text.includes("|")) {
					startLineNo--;
				}

				// Find the end of the table in the markdown text
				let endLineNo = currentLine.number;
				while (endLineNo < state.doc.lines && state.doc.line(endLineNo + 1).text.includes("|")) {
					endLineNo++;
				}

				let tableRowIndex = 0; // Counter for the actual markdown data rows
				const changes: any[] = [];

				// 4. Transform the rows inside the markdown text
				for (let lineNo = startLineNo; lineNo <= endLineNo; lineNo++) {
					const line = state.doc.line(lineNo);
					const text = line.text;

					// Skip the separator row (|---|)
					if (text.includes("---")) {
						continue;
					}

					const currentTableLineIndex = tableRowIndex;
					tableRowIndex++;

					// If this markdown line matches one of the selected UI rows
					if (affectedRows.includes(currentTableLineIndex)) {
						const parts = text.split("|");
						const hasLeading = text.trim().startsWith("|");
						const arrayIndex = hasLeading ? targetColumn + 1 : targetColumn;

						// Overwrite the value in the target column
						parts[arrayIndex] = ` ${fillValue} `;

						changes.push({
							from: line.from,
							to: line.to,
							insert: parts.join("|"),
						});
					}
				}

				// 5. Dispatch changes atomically into CodeMirror
				if (changes.length > 0) {
					cmView.dispatch({ changes });
				}
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
