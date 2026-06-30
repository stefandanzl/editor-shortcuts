import { Plugin, Editor, MarkdownView, Notice, EditorPosition, FuzzySuggestModal, App } from "obsidian";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { registerTableCommands } from "./table";

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
		registerTableCommands(this);

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
