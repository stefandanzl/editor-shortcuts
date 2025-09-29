# Codebase Structure and Architecture

## Directory Layout

```
editor-shortcuts/
├── .git/                      # Git repository
├── .serena/                   # Serena MCP data
├── main.ts                    # Main plugin source code ⭐
├── manifest.json              # Plugin metadata ⭐
├── package.json               # npm configuration ⭐
├── tsconfig.json              # TypeScript configuration
├── esbuild.config.mjs         # Build configuration
├── Taskfile.yml               # Task automation ⭐
├── .eslintrc                  # ESLint rules
├── .eslintignore              # ESLint ignore patterns
├── .editorconfig              # Editor configuration
├── .gitignore                 # Git ignore patterns
├── .npmrc                     # npm configuration
├── version-bump.mjs           # Version bumping script
├── versions.json              # Version history
├── styles.css                 # Plugin styles (unused)
├── README.md                  # Documentation
├── LICENSE                    # MIT License
├── package-lock.json          # Locked dependencies
└── main.js                    # Built output (generated)
```

⭐ = Most frequently modified files

## Main Plugin Architecture

### EditorShortcutsPlugin Class
The entire plugin is contained in a single class that extends Obsidian's `Plugin` class.

**Structure:**
```typescript
export default class EditorShortcutsPlugin extends Plugin {
    async onload() {
        // Plugin initialization
        // Register all commands here
    }

    onunload() {
        // Cleanup (currently just logs)
    }
}
```

### Command Pattern
Each editor feature is implemented as a command with:
- **id**: Unique identifier (kebab-case)
- **name**: Display name in command palette
- **editorCallback**: Function that receives an Editor instance

### Editor Operations
All commands use the Obsidian Editor API to:
1. Get cursor position (`editor.getCursor()`)
2. Read line content (`editor.getLine(line)`)
3. Modify text (`editor.replaceRange()`)
4. Update cursor (`editor.setCursor()`)

## Current Commands

### 1. Delete Current Line (`delete-current-line`)
- Deletes the entire line including newline character
- Handles edge case of last line in document

### 2. Move Line Up (`move-line-up`)
- Swaps current line with previous line
- Maintains cursor column position
- Only works if not on first line

### 3. Move Line Down (`move-line-down`)
- Swaps current line with next line
- Maintains cursor column position
- Only works if not on last line

### 4. Duplicate Line (`duplicate-line`)
- Creates a copy of current line below
- Moves cursor to the duplicated line
- Maintains cursor column position

## Build Process

### Development Build
1. esbuild watches `main.ts`
2. Bundles with source maps
3. External dependencies marked (obsidian, electron, etc.)
4. Outputs to `main.js`

### Production Build
1. TypeScript type checking (no emit)
2. esbuild bundles and minifies
3. No source maps
4. Tree-shaking enabled
5. Outputs optimized `main.js`

## Dependencies

### Runtime
- `obsidian` - Obsidian API (external)
- No other runtime dependencies

### Development
- TypeScript 4.7.4
- esbuild 0.17.3
- ESLint with TypeScript plugin
- Various type definitions

## Extension Points

### Adding New Commands
To add a new editor command:
1. Add a new `this.addCommand()` call in `onload()`
2. Define unique ID and name
3. Implement `editorCallback` with Editor logic
4. Update README.md with the new command
5. Suggest keyboard shortcut

### Adding Settings
Currently no settings UI. To add:
1. Define settings interface
2. Implement `loadSettings()` and `saveSettings()`
3. Create settings tab with `addSettingTab()`
4. Add settings properties to plugin class

### Adding Styles
`styles.css` exists but is not currently used. Can be used for:
- Custom UI elements
- Command palette styling
- Editor decorations

## Known Issues and Notes

### README Typo
- "Ctrl + Shirt + Backspace" should be "Ctrl + Shift + Backspace"

### Potential Improvements
- Add undo/redo handling
- Support for multi-line selections
- Add setting for customizing shortcuts
- Add more VSCode-like commands (e.g., copy line up/down)
- Better handling of edge cases

### No Tests
Currently relies on manual testing in Obsidian. Could benefit from:
- Unit tests for text manipulation logic
- Integration tests with mock Editor
