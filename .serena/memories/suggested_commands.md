# Suggested Commands for Editor Shortcuts Plugin

## Development Commands

### Quick Start
```bash
# Start development mode with hot reload
npm run dev
# OR
task dev
```

### Building
```bash
# Build for production (with type checking)
npm run build
# OR
task build

# Build and copy to vault (default task)
task
```

### Copy to Vault
```bash
# Copy built files to the Obsidian vault
task copy
```

### Version Management
```bash
# Bump patch version (0.2.0 -> 0.2.1)
npm version patch

# Bump minor version (0.2.0 -> 0.3.0)
npm version minor

# Bump major version (0.2.0 -> 1.0.0)
npm version major

# Automated bump: commit, bump minor, and update manifest
task bump
```

### Release Process
```bash
# Full release: commit, push, create GitHub release
task release
```

### Testing
```bash
# Currently no automated tests
# Manual testing in Obsidian vault
```

## Windows System Commands

### File Operations
```powershell
# List directory contents
dir
# OR
ls  # if using PowerShell

# Copy files
copy source.txt destination.txt
# OR
cp source.txt destination.txt  # PowerShell

# Find files
dir /s /b *.ts  # Search recursively for .ts files

# Search file contents
findstr "pattern" *.ts
# OR
Select-String "pattern" *.ts  # PowerShell
```

### Git Commands
```bash
# Common git workflow
git status
git add .
git commit -m "message"
git push

# View commit history
git log --oneline

# Create and push tag
git tag v0.2.0
git push --tags
```

### Navigation
```powershell
# Change directory
cd path\to\directory

# Go up one level
cd ..

# Go to project root
cd C:\PROJECTS\PROGRAMMIEREN\Obsidian Plugins\editor-shortcuts
```

## NPM Commands
```bash
# Install dependencies
npm install

# Update dependencies
npm update

# Check for outdated packages
npm outdated
```

## Task Commands Reference
```bash
task                 # Default: build and copy
task build          # Build the plugin
task copy           # Copy to vault
task dev            # Development mode
task bump           # Bump version and commit
task release        # Full release workflow
task patch          # npm version patch
task git            # Quick commit and push
task test           # Echo version (testing)
```
