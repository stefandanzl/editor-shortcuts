import { Plugin, Editor, MarkdownView, App } from "obsidian";

export default class EditorShortcutsPlugin extends Plugin {
	async onload() {
		console.log("Loading Editor Shortcuts plugin");

		// Command to delete the current line
		this.addCommand({
			id: "delete-current-line",
			name: "Delete current line",
			editorCallback: (editor: Editor) => {
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
			},
		});

		// Command to move the current line up
		this.addCommand({
			id: "move-line-up",
			name: "Move current line up",
			editorCallback: (editor: Editor) => {
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
			},
		});

		// Command to move the current line down
		this.addCommand({
			id: "move-line-down",
			name: "Move current line down",
			editorCallback: (editor: Editor) => {
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
			},
		});

		// Command to duplicate the current line
		this.addCommand({
			id: "duplicate-line",
			name: "Duplicate current line",
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
	}

	onunload() {
		console.log("Unloading Editor Shortcuts plugin");
	}
}
