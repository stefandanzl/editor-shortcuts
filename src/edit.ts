import { Editor, Notice } from "obsidian";
import EditorShortcutsPlugin from "./main";
import { getSelectedLineRange } from "./utils";
import { EditorView } from "@codemirror/view";

export async function registerBasicCommands(plugin: EditorShortcutsPlugin) {
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
