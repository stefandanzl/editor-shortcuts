# Editor Shortcuts - Project Overview

## Purpose
An Obsidian plugin that provides VSCode-like editor shortcuts for a better editing experience. The plugin adds commands for:
- Moving lines up/down (Alt + Up/Down)
- Duplicating lines (Ctrl + Shift + D)
- Deleting entire lines (Ctrl + Shift + Backspace)

## Tech Stack
- **Language**: TypeScript (ES6 target)
- **Framework**: Obsidian Plugin API
- **Build Tool**: esbuild for bundling
- **Task Runner**: Taskfile (task command)
- **Package Manager**: npm
- **Linting**: ESLint with TypeScript plugin
- **Version Control**: Git

## Project Structure
This is a single-file plugin with a simple structure:
- `main.ts` - Main plugin code (EditorShortcutsPlugin class)
- `manifest.json` - Plugin metadata
- `package.json` - npm dependencies and scripts
- `esbuild.config.mjs` - Build configuration
- `tsconfig.json` - TypeScript configuration
- `.eslintrc` - ESLint rules
- `Taskfile.yml` - Task automation
- `styles.css` - Plugin styles (currently not used)

## Development Setup
The plugin is developed for the "hirn" vault located at:
`C:\PROJECTS\Obsidian\hirn\.obsidian\plugins\editor-shortcuts`

## Key Features
- Clean, focused implementation with 4 editor commands
- Direct manipulation of editor text using Obsidian's Editor API
- Proper cursor position maintenance after operations
- No settings UI (simple, straightforward shortcuts)
