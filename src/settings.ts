import { App, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type EditorShortcutsPlugin from "./main";

export type AccentColor = "obsidian" | "custom" | "mono";

export type PrintSettings = {
	fontSize: string; // e.g. "9pt"; empty = styles.css decides
	accentColor: AccentColor; // custom = copy this window's accent vars
	pageSize: "A4" | "Letter" | "Legal" | "A5";
	landscape: boolean;
	scale: number;
	printBackground: boolean;
	generateDocumentOutline: boolean;
	generateTaggedPDF: boolean;
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
	fontSize: "",
	accentColor: "obsidian",
	pageSize: "A4",
	landscape: false,
	scale: 1,
	printBackground: true,
	generateDocumentOutline: true,
	generateTaggedPDF: true,
};

export class PrintSettingTab extends PluginSettingTab {
	constructor(app: App, plugin: EditorShortcutsPlugin) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Print font size",
				desc: 'Injected as --font-text-size, e.g. "9pt" or "12px". Empty = styles.css decides.',
				control: {
					type: "text",
					key: "fontSize",
					defaultValue: DEFAULT_PRINT_SETTINGS.fontSize,
					placeholder: "styles.css",
				},
			},
			{
				name: "Copy accent colors",
				desc: "Inject this window's accent colors into the print document. Off = Obsidian defaults.",
				control: {
					type: "dropdown",
					key: "accentColor",
					defaultValue: DEFAULT_PRINT_SETTINGS.accentColor,
					options: { obsidian: "obsidian", custom: "custom", mono: "mono" },
				},
			},
			{
				type: "group",
				heading: "PDF export",
				items: [
					{
						name: "Page size",
						desc: "Only applies if @page in styles.css declares no size.",
						control: {
							type: "dropdown",
							key: "pageSize",
							options: { A4: "A4", Letter: "Letter", Legal: "Legal", A5: "A5" },
							defaultValue: DEFAULT_PRINT_SETTINGS.pageSize,
						},
					},
					{
						name: "Landscape",
						control: { type: "toggle", key: "landscape", defaultValue: false },
					},
					{
						name: "Scale",
						control: {
							type: "number",
							key: "scale",
							min: 0.1,
							max: 2,
							step: 0.1,
							defaultValue: 1,
						},
					},
					{
						name: "Print background",
						control: { type: "toggle", key: "printBackground", defaultValue: true },
					},
					{
						name: "Document outline",
						desc: "Generate PDF bookmarks from headings.",
						control: {
							type: "toggle",
							key: "generateDocumentOutline",
							defaultValue: true,
						},
					},
					{
						name: "Tagged PDF",
						control: { type: "toggle", key: "generateTaggedPDF", defaultValue: true },
					},
				],
			},
		];
	}
}
