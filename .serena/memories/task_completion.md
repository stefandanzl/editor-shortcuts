# Task Completion Guidelines

## After Completing a Code Task

When you finish implementing a feature or fixing a bug, follow these steps:

### 1. Build and Test
```bash
# Build the plugin with type checking
npm run build
# OR
task build
```

This command:
- Runs TypeScript compiler with type checking (`tsc -noEmit -skipLibCheck`)
- Bundles the code with esbuild in production mode
- Minifies the output

### 2. Copy to Vault (Optional for Testing)
```bash
# Copy the built files to your Obsidian vault
task copy
```

This copies `main.js` and `manifest.json` to:
`C:\PROJECTS\Obsidian\hirn\.obsidian\plugins\editor-shortcuts`

### 3. Test in Obsidian
1. Open your Obsidian vault ("hirn")
2. Reload the plugin (Settings → Community plugins → Reload)
3. Test the functionality manually:
   - Try moving lines up/down
   - Test duplicating lines
   - Test deleting lines
   - Verify cursor position is maintained correctly

### 4. Verify No Linting Errors
While there's no explicit lint command in the scripts, esbuild will catch most errors during build. You can manually run ESLint if needed:
```bash
npx eslint main.ts
```

### 5. Commit Changes
```bash
# Stage all changes
git add .

# Commit with a descriptive message
git commit -m "feat: add new feature"
# OR use the quick task
task git
```

### 6. Version Bump (for releases)
```bash
# For bug fixes
npm version patch

# For new features
npm version minor

# For breaking changes
npm version major

# OR use automated bump
task bump
```

### 7. Create Release (when ready)
```bash
# Full release workflow: commit, push, create GitHub release
task release
```

## Development Workflow

### For Active Development
```bash
# Start dev mode with hot reload
npm run dev
# OR
task dev
```

In development mode:
- esbuild watches for changes
- Automatically rebuilds on file save
- Includes source maps for debugging

### Quick Build and Copy
```bash
# Default task: build and copy in one command
task
```

## Troubleshooting

### If Build Fails
1. Check TypeScript errors in the output
2. Verify all types are correctly imported
3. Ensure no unused variables (except function arguments)
4. Check for null/undefined handling

### If Plugin Doesn't Load
1. Check browser console in Obsidian (Ctrl+Shift+I)
2. Verify manifest.json is valid
3. Check that minAppVersion matches your Obsidian version
4. Ensure main.js is present in the vault plugin folder

### If Changes Don't Appear
1. Rebuild: `npm run build` or `task build`
2. Copy to vault: `task copy`
3. Reload plugin in Obsidian
4. Or restart Obsidian entirely

## Best Practices

### Before Committing
- [ ] Build succeeds without errors
- [ ] Tested manually in Obsidian
- [ ] No console errors
- [ ] All commands work as expected
- [ ] Cursor position is maintained correctly

### Before Releasing
- [ ] All features tested thoroughly
- [ ] README.md updated with new features
- [ ] Version bumped appropriately
- [ ] Changelog updated (if exists)
- [ ] Git tags created
- [ ] GitHub release created with built files
