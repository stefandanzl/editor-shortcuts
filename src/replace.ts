import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

const REPLACEMENTS = [
	{ trigger: "-->", replacement: "\u{27F6}" },
	{ trigger: "<--", replacement: "\u{27F5}" },
];

export const replacementExtension = EditorView.inputHandler.of((view, from, to, text) => {
	if (text.length !== 1) return false;

	for (const r of REPLACEMENTS) {
		const lastChar = r.trigger.slice(-1);
		const prefix = r.trigger.slice(0, -1);

		if (text !== lastChar) continue;
		if (from < prefix.length) continue;

		const before = view.state.doc.sliceString(from - prefix.length, from);
		if (before !== prefix) continue;

		// Skip Code context
		const node = syntaxTree(view.state).resolveInner(from, -1);
		let n: any = node;
		while (n) {
			if (n.name.toLowerCase().includes("code")) return false;
			n = n.parent;
		}

		// Replacement asynchron as separate transaction
		// (after regular input insert)
		queueMicrotask(() => {
			// Position recalculation - could have moved
			const replaceFrom = from - prefix.length;
			const replaceTo = from + 1; // +1 because of added character

			view.dispatch({
				changes: { from: replaceFrom, to: replaceTo, insert: r.replacement },
				userEvent: "input.replace",
			});
		});

		return false; // false = treat input regularly
	}
	return false;
});
