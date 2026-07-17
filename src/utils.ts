import { Editor } from "obsidian";

// Helper function to get selected line range
export const getSelectedLineRange = (editor: Editor) => {
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
