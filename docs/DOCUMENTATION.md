# Documentation Index

This document provides an overview of all available documentation for the ArcGIS Velocity Logger project.

## 📚 Documentation Overview

The project includes comprehensive documentation covering architecture, development, testing, configuration, and user guides. All documentation is written in Markdown format for easy reading and maintenance.

## 📖 Documentation Files

### Core Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| [README.md](../README.md) | Project overview, quick start guide, and CLI/headless overview | All users |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, process topology, and design patterns | Developers |
| [BUILD.md](./BUILD.md) | Build scripts, package formats, compression options, and output artifacts | Developers |
| [RELEASE.md](./RELEASE.md) | Release process: `scripts/release.sh` release script, version tagging, code signing per platform | Developers |
| [CONFIG.md](./CONFIG.md) | Configuration management, settings, themes, and fonts | Users, Developers |
| [DEBUGGING.md](./DEBUGGING.md) | Debug commands, DevTools setup, headless debugging, common issues | Developers |
| [COMMAND-LINE.md](./COMMAND-LINE.md) | All CLI parameters, six-column reference, help layouts, and examples | Users, Developers |
| [HEADLESS.md](./HEADLESS.md) | No-UI capture guide, launch examples, and condensed CLI reference | Users, Developers |

### Development Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| [TESTING.md](./TESTING.md) | Test commands, suite descriptions, and manual smoke tests | Developers |
| [KEYBOARD-SHORTCUTS.md](./KEYBOARD-SHORTCUTS.md) | Complete keyboard shortcut reference including CLI dialog shortcuts | Users |
| [WHY-ELECTRON.md](./WHY-ELECTRON.md) | Technology choice rationale | Developers, Stakeholders |
| [DEVELOPMENT-SUMMARY.md](./DEVELOPMENT-SUMMARY.md) | Technical implementation details and recent changes | Developers |

### User Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| [RELEASE-NOTES.md](./RELEASE-NOTES.md) | User-facing features and changes by release | Users |
| [COMMAND-LINE.md](./COMMAND-LINE.md#in-app-command-line-interface-dialog-reference) | Searchable in-app CLI reference with chips, pills, and multi-format export | Users |
| [HEADLESS.md](./HEADLESS.md) | No-UI capture guide plus mirrored CLI parameter table | Users |

### Technical Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| [GRPC.md](./GRPC.md) | gRPC transport modes, serialization formats, TLS, metadata | Developers |
| [THEME-REFACTOR-SUMMARY.md](./THEME-REFACTOR-SUMMARY.md) | Theme system refactoring: per-file CSS and dynamic loader | Developers |

## 🎯 Documentation Categories

### For End Users
- **Getting Started**: [README.md](../README.md) — quick start and basic usage
- **Configuration**: [CONFIG.md](./CONFIG.md) — settings and customization
- **Command Line**: [COMMAND-LINE.md](./COMMAND-LINE.md) — CLI parameters, help layouts, and the interactive CLI dialog
- **Headless Capture**: [HEADLESS.md](./HEADLESS.md) — no-UI capture guide with condensed parameter table
- **Keyboard Shortcuts**: [KEYBOARD-SHORTCUTS.md](./KEYBOARD-SHORTCUTS.md) — complete shortcut reference
- **Release Notes**: [RELEASE-NOTES.md](./RELEASE-NOTES.md) — new features and changes

### For Developers
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md) — system design and patterns
- **Build & Package**: [BUILD.md](./BUILD.md) — build scripts and packaging
- **Release**: [RELEASE.md](./RELEASE.md) — `scripts/release.sh` release script and code signing
- **Debugging**: [DEBUGGING.md](./DEBUGGING.md) — development and troubleshooting
- **Testing**: [TESTING.md](./TESTING.md) — test infrastructure and manual checks
- **Development Summary**: [DEVELOPMENT-SUMMARY.md](./DEVELOPMENT-SUMMARY.md) — implementation details
- **gRPC**: [GRPC.md](./GRPC.md) — transport implementation details

### For Stakeholders
- **Technology Choice**: [WHY-ELECTRON.md](./WHY-ELECTRON.md) — framework selection rationale
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md) — system overview

## 📋 Documentation Standards

### Writing Guidelines
- **Clear Structure**: Use consistent headings and organization
- **Code Examples**: Include practical code snippets and examples
- **Cross-References**: Link related documents for easy navigation
- **Tables**: Use Markdown tables for structured reference information
- **Regular Updates**: Keep documentation current with code changes

### Markdown Conventions
- **Headers**: `#` main title, `##` sections, `###` subsections
- **Code Blocks**: Triple backticks with language specification
- **Links**: Relative paths for internal documentation links
- **Tables**: For structured commands, settings, and comparisons

## 🔄 Documentation Maintenance

### Update Schedule
- **README.md**: Update with each significant feature addition
- **ARCHITECTURE.md**: Update when system design changes
- **CONFIG.md**: Update when configuration options change
- **DEBUGGING.md**: Update when debugging procedures change
- **TESTING.md**: Update when test infrastructure changes
- **COMMAND-LINE.md**: Update when CLI parameters or help layouts change
- **HEADLESS.md**: Update when headless examples or parameter table changes
- **RELEASE-NOTES.md**: Update with each release
- **RELEASE.md**: Update when the release workflow, signing setup, or CI configuration changes

### Adding New Documentation
1. Create the Markdown file under `docs/`
2. Follow established conventions and structure
3. Add an entry to this index (`DOCUMENTATION.md`)
4. Add a row to the `docs/README.md` Guides table
5. Add a row to the root `README.md` Documentation table

## 🔗 Quick Links

### Essential Reading
- [Quick Start](../README.md#quick-start)
- [Documentation Table](../README.md#documentation)

### Development Resources
- [Testing Guide](./TESTING.md)
- [Debugging Guide](./DEBUGGING.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Release Process](./RELEASE.md)

### User Resources
- [Release Notes](./RELEASE-NOTES.md)
- [Headless Capture Guide](./HEADLESS.md)
- [CLI Reference](./COMMAND-LINE.md)

---

*This documentation index is maintained as part of the ArcGIS Velocity Logger project.*

