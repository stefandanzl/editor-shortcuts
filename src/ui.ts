import { FuzzySuggestModal, App, Modal, TFile } from "obsidian";
import EditorShortcutsPlugin from "./main";

const formatSize = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export class FilePropertiesModal extends Modal {
	constructor(
		app: App,
		private file: TFile,
	) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText("File properties");
		const { contentEl, file } = this;
		const stat = file.stat;

		const tbody = contentEl.createEl("table").createEl("tbody");
		const row = (label: string, value: string) => {
			const tr = tbody.createEl("tr");
			const th = tr.createEl("th", { text: label });
			th.style.textAlign = "left";
			const td = tr.createEl("td", { text: value });
			td.style.textAlign = "left";
		};

		row("Name", file.name);
		row("Path", file.path);
		row("Size", formatSize(stat.size));
		row("Created", new Date(stat.ctime).toLocaleString());
		row("Modified", new Date(stat.mtime).toLocaleString());
	}

	onClose() {
		this.contentEl.empty();
	}
}

export async function registerUiCommands(plugin: EditorShortcutsPlugin) {
	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file, source) => {
			if (!(file instanceof TFile)) return; // folders have no file stats
			//if (!["more-options", "file-explorer-context"].contains(source)) return;
			menu.addItem((item) => {
				item.setTitle("Show note file properties")
					.setIcon("info")
					.onClick(() => new FilePropertiesModal(plugin.app, file).open());
			});
		}),
	);

	// Command to toggle both sidebars
	plugin.addCommand({
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
			const { leftSplit, rightSplit } = plugin.app.workspace;

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

	// Trigger Obsidian's editor autocomplete (tags, file links, …) — like
	// Ctrl+Space in VS Code. Reaches into a private API; fails silently.
	plugin.addCommand({
		id: "trigger-suggestion",
		name: "Trigger autocomplete suggestion",
		icon: "text-cursor-input",
		hotkeys: [{ modifiers: ["Ctrl"], key: " " }],
		editorCallback: (editor, view) => {
			const suggest = (plugin.app.workspace as any).editorSuggest;
			if (!suggest || typeof suggest.trigger !== "function") return;
			try {
				suggest.trigger(editor, view.file, true);
			} catch {
				/* fail silently */
			}
		},
	});
}
