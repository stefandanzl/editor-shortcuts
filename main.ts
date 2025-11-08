import { Plugin, Editor } from "obsidian";

export default class EditorShortcutsPlugin extends Plugin {
	async onload() {
		console.log("Loading Editor Shortcuts plugin");

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
				const { hasMultiLineSelection, startLine, endLine } =
					getSelectedLineRange(editor);

				if (hasMultiLineSelection) {
					// Delete multiple lines
					const lastLine = editor.lineCount() - 1;

					if (endLine === lastLine) {
						// If deleting lines at the end, also delete the newline before them
						const startCh =
							startLine > 0
								? editor.getLine(startLine - 1).length
								: 0;
						const startDeleteLine =
							startLine > 0 ? startLine - 1 : startLine;
						const endLineText = editor.getLine(endLine);

						editor.replaceRange(
							"",
							{ line: startDeleteLine, ch: startCh },
							{ line: endLine, ch: endLineText.length },
							"delete-line"
						);
					} else {
						// Delete from start of first line to start of line after last line
						editor.replaceRange(
							"",
							{ line: startLine, ch: 0 },
							{ line: endLine + 1, ch: 0 },
							"delete-line"
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
						"delete-line"
					);

					// Delete the new line character
					if (line < editor.lineCount() - 1) {
						editor.replaceRange(
							"",
							{ line: line, ch: 0 },
							{ line: line + 1, ch: 0 },
							"delete-line"
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
				const { hasMultiLineSelection, startLine, endLine } =
					getSelectedLineRange(editor);

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
					const newContent =
						selectedLines.join("\n") + "\n" + lineAbove;
					editor.replaceRange(
						newContent,
						{ line: startLine - 1, ch: 0 },
						{ line: endLine, ch: editor.getLine(endLine).length },
						"move-line"
					);

					// Restore selection, shifted up by 1
					editor.setSelection(
						{ line: startLine - 1, ch: 0 },
						{
							line: endLine - 1,
							ch: editor.getLine(endLine - 1).length,
						}
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
							"move-line"
						);

						// Replace the current line with the previous line
						editor.replaceRange(
							prevLineText,
							{ line: line, ch: 0 },
							{ line: line, ch: currentLineText.length },
							"move-line"
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
				const { hasMultiLineSelection, startLine, endLine } =
					getSelectedLineRange(editor);

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
					const newContent =
						lineBelow + "\n" + selectedLines.join("\n");
					editor.replaceRange(
						newContent,
						{ line: startLine, ch: 0 },
						{
							line: endLine + 1,
							ch: editor.getLine(endLine + 1).length,
						},
						"move-line"
					);

					// Restore selection, shifted down by 1
					editor.setSelection(
						{ line: startLine + 1, ch: 0 },
						{
							line: endLine + 1,
							ch: editor.getLine(endLine + 1).length,
						}
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
							"move-line"
						);

						// Replace the current line with the next line
						editor.replaceRange(
							nextLineText,
							{ line: line, ch: 0 },
							{ line: line, ch: currentLineText.length },
							"move-line"
						);

						// Move the cursor down a line while maintaining the same column position
						editor.setCursor({ line: line + 1, ch: cursor.ch });
					}
				}
			},
		});

		// Command to duplicate the current line
		this.addCommand({
			id: "duplicate-line",
			name: "Duplicate current line",
			icon: "layers-2",
			hotkeys: [
				{
					modifiers: ["Alt"],
					key: "D",
				},
			],
			editorCallback: (editor: Editor) => {
				const cursor = editor.getCursor();
				const line = cursor.line;
				const lineText = editor.getLine(line);

				// Insert the current line text at the next line
				editor.replaceRange(
					"\n" + lineText,
					{ line: line, ch: lineText.length },
					{ line: line, ch: lineText.length },
					"duplicate-line"
				);

				// Move the cursor to the duplicated line
				editor.setCursor({ line: line + 1, ch: cursor.ch });
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
				// @ts-ignore
				this.app.commands.commands[
					"app:toggle-left-sidebar"
				].checkCallback();
				// @ts-ignore
				this.app.commands.commands[
					"app:toggle-right-sidebar"
				].checkCallback();
			},
		});
	}

	onunload() {
		console.log("Unloading Editor Shortcuts plugin");
	}
}
