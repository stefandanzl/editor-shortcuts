import { FuzzySuggestModal, App, Modal, TFile } from "obsidian";

// Picker shown when the CSV delimiter can't be auto-detected confidently.
// Uses Obsidian's built-in FuzzySuggestModal (type-to-filter, keyboard nav).
type CsvDelimiterOption = { delim: string; label: string; cols: number; rows: number };

export class CsvDelimiterSuggestModal extends FuzzySuggestModal<CsvDelimiterOption> {
	constructor(
		app: App,
		private options: CsvDelimiterOption[],
		private onPick: (delim: string) => void,
	) {
		super(app);
		this.setPlaceholder("Pick a CSV delimiter…");
	}

	getItems(): CsvDelimiterOption[] {
		return this.options;
	}

	getItemText(item: CsvDelimiterOption): string {
		return `${item.label}  →  ${item.cols} column${item.cols === 1 ? "" : "s"}, ${item.rows} row${item.rows === 1 ? "" : "s"}`;
	}

	onChooseItem(item: CsvDelimiterOption): void {
		this.onPick(item.delim);
	}
}

// Picker shown when a table-cell selection spans multiple rows AND columns,
// so the user confirms the fill direction (or aborts). "Abort" is first so it
// is the default — pressing Enter changes nothing, avoiding accidental damage.
type FillOption = { label: string; value: "abort" | "down" | "right" };

export class FillDirectionSuggestModal extends FuzzySuggestModal<FillOption> {
	constructor(
		app: App,
		private onPick: (value: FillOption["value"]) => void,
	) {
		super(app);
		this.setPlaceholder("Selection spans several rows and columns — pick an action…");
	}

	getItems(): FillOption[] {
		return [
			{ label: "Abort (no change)", value: "abort" },
			{ label: "Fill down — each column from its top cell", value: "down" },
			{ label: "Fill right — each row from its left cell", value: "right" },
		];
	}

	getItemText(item: FillOption): string {
		return item.label;
	}

	onChooseItem(item: FillOption): void {
		this.onPick(item.value);
	}
}

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
