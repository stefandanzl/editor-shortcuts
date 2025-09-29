# Code Style and Conventions

## TypeScript Configuration

### Compiler Options
- **Target**: ES6
- **Module**: ESNext
- **Module Resolution**: Node
- **Source Maps**: Inline source maps and sources
- **Strict Type Checking**: 
  - `noImplicitAny: true` - All variables must have explicit types
  - `strictNullChecks: true` - Null and undefined must be handled explicitly

### Libraries
- DOM, ES5, ES6, ES7

## Code Style Guidelines

### Naming Conventions
- **Classes**: PascalCase (e.g., `EditorShortcutsPlugin`)
- **Methods/Functions**: camelCase (e.g., `onload`, `getCursor`)
- **Variables**: camelCase (e.g., `cursor`, `lineText`)
- **Constants**: camelCase (no UPPER_CASE convention observed)
- **Command IDs**: kebab-case (e.g., `delete-current-line`, `move-line-up`)

### TypeScript Patterns
- Use explicit type annotations for function parameters
- Use the Obsidian API types (e.g., `Editor`, `Plugin`)
- Prefer `const` over `let` when possible
- Use arrow functions for callbacks

### Example Pattern
```typescript
this.addCommand({
    id: "command-id",
    name: "Command Name",
    editorCallback: (editor: Editor) => {
        const cursor = editor.getCursor();
        const line = cursor.line;
        // ... implementation
    },
});
```

## ESLint Rules

### Active Rules
- No unused variables (enforced for TypeScript)
- Function arguments can be unused (useful for callbacks)
- TypeScript comments (`@ts-ignore`, etc.) are allowed
- Empty functions are allowed
- No prototype builtins check disabled

### Disabled Rules
- `no-unused-vars` (off in favor of TypeScript version)
- `@typescript-eslint/ban-ts-comment` (off)
- `no-prototype-builtins` (off)
- `@typescript-eslint/no-empty-function` (off)

## File Organization

### Single File Plugin Structure
```typescript
import { Plugin, Editor } from "obsidian";

export default class PluginNamePlugin extends Plugin {
    async onload() {
        // Plugin initialization
        // Add commands here
    }

    onunload() {
        // Cleanup
    }
}
```

### Command Structure
Each command follows this pattern:
1. Unique command ID (kebab-case)
2. Human-readable name
3. `editorCallback` that receives an `Editor` instance
4. Implementation using Editor API methods

## Editor API Usage

### Common Patterns
```typescript
// Get cursor position
const cursor = editor.getCursor();
const line = cursor.line;
const ch = cursor.ch;

// Get line content
const lineText = editor.getLine(line);

// Replace text range
editor.replaceRange(
    newText,
    { line: startLine, ch: startCh },
    { line: endLine, ch: endCh },
    origin  // e.g., "delete-line", "move-line"
);

// Set cursor position
editor.setCursor({ line: newLine, ch: newCh });

// Get line count
const lineCount = editor.lineCount();
```

## Comments
- Use inline comments for complex logic
- Descriptive comments for each major operation
- Console logs for debugging (removed in production builds)

## Formatting
- Tabs for indentation (inherited from .editorconfig)
- Consistent spacing around operators
- Line breaks between major code blocks
