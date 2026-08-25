import { Editor, htmlToMarkdown } from "obsidian";
import EditorShortcutsPlugin from "./main";
import { getSelectedLineRange } from "./utils";

function removeExtraLines(contentLines: string) {
	contentLines = contentLines.replace(/(?<!\|[^\n]*)\n[ \t]*\n(?!#|---|[\t ]*>|\|)/g, "\n");

	// Set either "\n\n---\n\n" or "\n\n" to either keep hr lines or remove them
	const hrReplacement = "\n\n---\n\n";
	return contentLines.replace(/\n\n[ \t]*---[ \t]*\n/g, hrReplacement);
}

async function clipboardHtmlMarkdown() {
	let htmlContent = "";
	try {
		const items = await navigator.clipboard.read();
		if (items && items.length > 0) {
			const item = items[0];
			if (item.types.includes("text/html")) {
				const blob = await item.getType("text/html");
				if (blob) htmlContent = await blob.text();
			}
		}
	} catch {
		/* Fallback handled later */
	}
	if (!htmlContent || htmlContent.trim().length === 0) {
		htmlContent = await navigator.clipboard.readText();
	}
	if (!htmlContent || htmlContent.trim().length === 0) return;
	return htmlToMarkdown(htmlContent);
}

function transformSelection(editor: Editor, transformFn: (text: string) => string) {
	const selection = editor.getSelection();

	if (selection) {
		editor.replaceSelection(transformFn(selection));
	} else {
		const cursor = editor.getCursor();
		const wordRange = editor.wordAt(cursor);
		if (!wordRange) return;

		const word = editor.getRange(wordRange.from, wordRange.to);
		editor.replaceRange(transformFn(word), wordRange.from, wordRange.to, "capitalization");
	}
}

const toUpperCase = (str: string) => str.toUpperCase();
const toLowerCase = (str: string) => str.toLowerCase();
const toTitleCase = (str: string) =>
	str.replace(/\p{L}+/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

export async function registerFormatCommands(plugin: EditorShortcutsPlugin) {
	// Command to remove extra double newlines
	plugin.addCommand({
		id: "remove-extra-newlines-selection",
		name: "Remove extra newlines in selection",
		icon: "chevrons-down-up",
		editorCheckCallback: (checking: boolean, editor: Editor) => {
			const { hasMultiLineSelection, startLine, endLine } = getSelectedLineRange(editor);

			if (checking) {
				return hasMultiLineSelection;
			}
			if (!hasMultiLineSelection) return;

			let textSelection = editor.getSelection();
			console.log(textSelection);
			const processedText = removeExtraLines(textSelection);
			editor.replaceSelection(processedText, "remove-newlines-select");
		},
	});

	// Command to remove extra double newlines and paste
	plugin.addCommand({
		id: "remove-extra-newlines-paste",
		name: "Paste after removing extra newlines",
		icon: "clipboard-x",

		editorCallback: async (editor: Editor) => {
			const content = await clipboardHtmlMarkdown();
			if (!content) return;

			const markdown = removeExtraLines(content);
			if (!markdown) return;
			editor.replaceSelection(markdown, "remove-newlines-paste");
		},
	});

	plugin.addCommand({
		id: "cycle-bullet-style",
		name: "Cycle bullet style",
		icon: "list-bullets",
		editorCallback: (editor: Editor) => {
			const from = editor.getCursor("from");
			const to = editor.getCursor("to");

			const startLine = from.line;
			const endLine = to.line;
			const isMultiline = startLine !== endLine;

			// 1. Target-Style anhand der ERSTEN nicht-leeren Zeile (oder der ersten Zeile) bestimmen
			let targetLineIndex = startLine;
			if (isMultiline) {
				for (let i = startLine; i <= endLine; i++) {
					if (editor.getLine(i).trim().length > 0) {
						targetLineIndex = i;
						break;
					}
				}
			}

			const refLine = editor.getLine(targetLineIndex);
			const refLineMatch = refLine.match(/^(\s*)([-+*])(\s)/);

			let targetMarker: "-" | "+" | "*" | "none" = "-";

			if (refLineMatch) {
				const [, , marker] = refLineMatch;
				const content = refLine.slice(refLineMatch[0].length);
				const isCheckbox = content.match(/^\[.\]\s*/);

				if (isCheckbox) {
					targetMarker = "-";
				} else if (marker === "-") {
					targetMarker = "+";
				} else if (marker === "+") {
					targetMarker = "*";
				} else if (marker === "*") {
					targetMarker = "none";
				}
			}

			// 2. Transformierten Block bauen
			const newLines: string[] = [];
			const indentLens: number[] = [];
			const deltas: number[] = [];

			for (let i = startLine; i <= endLine; i++) {
				const line = editor.getLine(i);

				// NEU: Bei Mehrzeilenselektion leere/Whitespace-Zeilen einfach überspringen
				if (isMultiline && line.trim().length === 0) {
					newLines.push(line);
					indentLens.push(line.length);
					deltas.push(0);
					continue;
				}

				const match = line.match(/^(\s*)([-+*])(\s)/);
				let oldPrefixLen: number;
				let newPrefixLen: number;
				let newLine: string;
				let indentLen: number;

				if (!match) {
					// Zeile hat noch keinen Bullet
					const indentMatch = line.match(/^(\s*)/);
					const indent = indentMatch ? indentMatch[1] : "";
					indentLen = indent.length;
					oldPrefixLen = indent.length;

					if (targetMarker !== "none") {
						const content = line.slice(indent.length);
						newLine = content
							? `${indent}${targetMarker} ${content}`
							: `${indent}${targetMarker} `;
						newPrefixLen = indent.length + 2;
					} else {
						newLine = line;
						newPrefixLen = indent.length;
					}
				} else {
					// Zeile hat bereits einen Bullet
					const [, indent, , space] = match;
					indentLen = indent.length;
					let content = line.slice(match[0].length);

					const checkboxMatch = content.match(/^(\[.\]\s*)(.*)/s);
					let checkboxLen = 0;
					if (checkboxMatch) {
						content = checkboxMatch[2];
						checkboxLen = checkboxMatch[1].length;
					}
					oldPrefixLen = match[0].length + checkboxLen;

					if (targetMarker === "none") {
						newLine = `${indent}${content}`;
						newPrefixLen = indent.length;
					} else {
						newLine = `${indent}${targetMarker}${space}${content}`;
						newPrefixLen = indent.length + 1 + space.length;
					}
				}
				newLines.push(newLine);
				indentLens.push(indentLen);
				deltas.push(newPrefixLen - oldPrefixLen);
			}

			// 3. Apply the whole block atomically
			editor.replaceRange(
				newLines.join("\n"),
				{ line: startLine, ch: 0 },
				{ line: endLine, ch: editor.getLine(endLine).length },
				"cycle-bullet",
			);

			// 4. Restore cursor/selection, shifted by each line's prefix delta so
			//    it lands at the same spot in the text. Line numbers are unchanged
			//    (we replace exactly the selected lines). A caret stays a caret.
			const mapCh = (line: number, ch: number): number => {
				const idx = line - startLine;
				const indentLen = indentLens[idx] ?? 0;
				const delta = deltas[idx] ?? 0;
				// delta > 0 only when a marker was added to a no-bullet line: jump
				// the caret past it (so an empty line -> "- |") instead of leaving
				// it sitting in the indent.
				let newCh = ch <= indentLen ? (delta > 0 ? indentLen + delta : ch) : ch + delta;
				const len = newLines[idx]?.length ?? 0;
				if (newCh < 0) newCh = 0;
				if (newCh > len) newCh = len;
				return newCh;
			};
			editor.setSelection(
				{ line: from.line, ch: mapCh(from.line, from.ch) },
				{ line: to.line, ch: mapCh(to.line, to.ch) },
			);
		},
	});

	plugin.addCommand({
		id: "paste-html-as-markdown",
		name: "Paste HTML as Markdown",
		icon: "clipboard-type",
		editorCallback: async (editor) => {
			const markdown = await clipboardHtmlMarkdown();
			if (!markdown) return;
			editor.replaceSelection(markdown, "html-markdown-paste");
		},
	});

	// Capitalization Funtions
	plugin.addCommand({
		id: "transform-uppercase",
		name: "Capitalization: UPPERCASE",
		icon: "case-upper",
		editorCallback: (editor: Editor) => {
			transformSelection(editor, toUpperCase);
		},
	});
	plugin.addCommand({
		id: "transform-lowercase",
		name: "Capitalization: lowercase",
		icon: "case-lower",
		editorCallback: (editor: Editor) => {
			transformSelection(editor, toLowerCase);
		},
	});
	// 3. Title Case / First Letter Capital
	plugin.addCommand({
		id: "transform-titlecase",
		name: "Capitalization: Title Case",
		icon: "case-sensitive",
		editorCallback: (editor: Editor) => {
			transformSelection(editor, toTitleCase);
		},
	});
}
