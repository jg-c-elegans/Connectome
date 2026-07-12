# Connectome

<p align="center">
  <strong>A Markdown-first desktop workspace built on Eclipse Theia.</strong>
</p>

<p align="center">
  Write and organize notes, work with code, browse the web, and use familiar IDE tools without leaving one Windows application.
</p>

<p align="center">
  <img alt="Platform: Windows" src="https://img.shields.io/badge/platform-Windows-0078D4?logo=windows11&logoColor=white">
  <img alt="Node.js 22 or newer" src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white">
  <img alt="Yarn Classic" src="https://img.shields.io/badge/Yarn-Classic-2C8EBB?logo=yarn&logoColor=white">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

> [!IMPORTANT]
> Connectome is under active development. Features described below are present in the source tree, but some recent additions still require hands-on runtime testing. Expect rough edges and breaking changes.

## About

Connectome is a Windows-only Electron desktop application for people who want a capable Markdown workspace without giving up the tools of a full integrated development environment (IDE). It is optimized for the author's primary workflow—Markdown notes and Python—while retaining Eclipse Theia's file explorer, editor, terminal, search, source-control, debugging, task, notebook, and extension capabilities.

The project is independently developed by [James Grimm](https://github.com/jg-c-elegans) of Elegans Labs and published as open-source software. Connectome is a derivative of [Eclipse Theia](https://theia-ide.org/); the ongoing rebrand intentionally preserves Theia's license and upstream attribution.

## Highlights

### Markdown and notes

- Wikilinks with navigation and creation of missing notes
- Backlinks, unlinked mentions, tags, aliases, properties, and diagnostics
- Note embeds, heading and block references, callouts, and pasted-image handling
- Rename support with link rewriting
- Starred, recent, orphaned, and all-note views
- Daily notes and a calendar view
- A formatting toolbar and keyboard shortcuts
- HTML and PDF export
- Mermaid diagrams and a themed Markdown preview
- Optional in-editor Live Preview that visually formats Markdown without changing the stored text

### Visual organization

- JSON-based canvases for arranging note and text cards
- A workspace knowledge graph with folder and tag filters
- A local graph for the active note
- Library, Calendar, Canvas, History, Dashboard, and Graph destinations in the activity rail

### Integrated web research

- Multi-tab browsing inside the desktop application
- Back, forward, reload, and home controls
- Bookmarks, browsing history, and saved pages
- A dedicated Web activity with collapsible sidebar sections

The browser currently stores its metadata in renderer-local storage. A full download manager, quote-to-note workflow, and atomic user-data persistence are future work.

### Desktop workspace

- Theia's editor, Explorer, search, terminal, source control, debugging, tasks, notebooks, and VS Code/Open VSX plugin support
- A Connectome welcome page and custom dark theme
- A card-based desktop layout tailored to the current product design
- Right-side Claude and Codex terminal launchers for locally installed, authenticated CLIs

The Claude and Codex launchers do not bundle those tools or credentials. Their respective command-line programs must already be installed, available on `PATH`, and authenticated by the user.

## Current status

Connectome has one supported product target:

| Target | Status |
| --- | --- |
| Windows Electron desktop application | Active development |
| Hosted browser application | Not supported |
| macOS or Linux packages | Not supported |

The source builds successfully in the current development environment. Recent features—including the Knowledge Graph—have build verification but may not yet have complete manual runtime QA. Public releases are planned through the Microsoft Store (MSIX) and GitHub Releases (a custom Avalonia-based EXE installer). Until the first release is published, the instructions below describe building from source and preparing the GitHub installer payload.

## Getting started

### Prerequisites

- Windows 10 or Windows 11
- [Node.js](https://nodejs.org/) 22 or newer
- [Yarn Classic](https://classic.yarnpkg.com/) 1.x (`>=1.7.0 <2`)
- Git, if cloning from a remote repository

Native Node dependencies may also require the standard Windows C++ build tools and Python when a compatible prebuilt binary is unavailable.

### Install and build

From PowerShell in the repository root:

```powershell
yarn install
yarn build
```

For a faster development build:

```powershell
yarn build:dev
```

Start the desktop application:

```powershell
yarn desktop:start
```

> [!NOTE]
> On systems where PowerShell blocks the `yarn.ps1` shim, use `yarn.cmd` in place of `yarn`.

### Prepare the Windows release payload

The public GitHub release will use a separate custom Avalonia installer. The installer consumes a ZIP of the complete unpacked Electron application; it must not be assembled from selected source files because the application also needs its Electron runtime, native libraries, resources, plugins, and packaged application data.

Build the production application and create that ZIP:

```powershell
.\scripts\package-installer.ps1
```

The script runs the production unpacked-package build, then writes a versioned archive beneath `artifacts/installer/`. Copy that archive into the separate `ConnectomeInstaller` project before publishing the installer. If `applications/desktop/dist/win-unpacked/` has already been built and is current, it can be reused:

```powershell
.\scripts\package-installer.ps1 -SkipBuild
```

The legacy Electron Builder NSIS command (`yarn desktop:package`) remains available for development or comparison, but its generated `ConnectomeSetup.exe` is not the planned public installer.

The Microsoft Store package uses the Store-facing name **Connectome IDE**. After entering the exact Partner Center values in `packaging/msix/store-identity.json`, create the x64 MSIX with:

```powershell
.\scripts\package-msix.ps1
```

See [`packaging/msix/README.md`](packaging/msix/README.md) for identity, local-signing, and validation details.

#### Install

Download the custom Connectome installer EXE from GitHub Releases and follow its install wizard. Store users will install Connectome through the Microsoft Store.

#### Uninstall

Uninstall Connectome the same way as any other Windows application: open **Settings → Apps → Installed apps**, find Connectome, and choose **Uninstall**. Exact custom-installer uninstall and user-data behavior will be documented once the Avalonia installer implements it.

## Development

### Common commands

| Command | Purpose |
| --- | --- |
| `yarn build` | Build local extensions and the production desktop bundle |
| `yarn build:dev` | Build local extensions and a development desktop bundle |
| `yarn watch` | Watch workspace packages for changes |
| `yarn lint` | Run lint checks |
| `yarn lint:fix` | Apply supported automatic lint fixes |
| `yarn test` | Run package tests |
| `yarn desktop:build` | Build the production desktop bundle only |
| `yarn desktop:build:dev` | Build the development desktop bundle only |
| `yarn desktop:test` | Run desktop application tests |
| `yarn clean` | Remove generated package output and root dependencies |

The repository uses a Yarn Classic workspace with Lerna. A full build first compiles the custom `connectome-*` extensions and then assembles the Electron application.

### Repository structure

```text
connectome/
├── applications/
│   └── desktop/              Windows Electron product
├── connectome-extensions/
│   ├── browser/              Integrated Web research browser
│   ├── notes/                Markdown and note-taking features
│   └── product/              Branding, theme, layout, and product UI
├── plugins/                  Bundled VS Code/Open VSX and local plugins
├── configs/                  Shared TypeScript and lint configuration
├── scripts/                  Build and maintenance scripts
├── patches/                  Dependency patches applied after install
├── docs/                     Developer documentation
├── .workspace/               Author-maintained plans and working notes
└── .agents_workspace/        Cross-agent documentation and handoffs
```

Generated directories such as `applications/desktop/src-gen/`, compiled `lib/` folders, and dependency caches should not normally be edited by hand.

### Architecture at a glance

Connectome is assembled from upstream `@theia/*` packages and three local Theia extensions:

| Package | Responsibility |
| --- | --- |
| `connectome-desktop-app` | The Windows Electron application and packaging configuration |
| `connectome-product-ext` | Product identity, welcome page, theme, shell layout, and agent launchers |
| `connectome-notes-ext` | Markdown indexing, navigation, note views, Live Preview, Canvas, Graph, and export |
| `connectome-browser-ext` | Embedded web tabs, research data, and desktop browser integration |

The visible interface runs in Electron's Chromium renderer. File-system access and other privileged operations run in Theia's Node backend or Electron main process and communicate with the frontend through framework services or narrow IPC APIs.

For more detail, see [Developing with a local Connectome/Theia checkout](docs/developing-with-local-connectome.md) and the beginner-oriented material in [`.agents_workspace/codebase_explainer`](.agents_workspace/codebase_explainer/).

## Roadmap

Current priorities include:

- Complete the visible and internal Theia-to-Connectome rebrand while preserving upstream attribution
- Harden and manually test the recently added note, graph, Live Preview, and browser workflows
- Improve editing of tables, Mermaid blocks, and callouts while Live Preview is enabled
- Add daily-note templates and deeper note-organization workflows
- Replace browser-local metadata storage and add downloads and quote-to-note research tools
- Continue refining packaging, automated testing, and release documentation

Roadmap items are directional and may change as the application is used and refined.

## Contributing

Issues, focused bug reports, documentation improvements, and small pull requests are welcome once a public remote and contribution workflow are established. Until then:

1. Keep changes scoped and avoid broad drive-by replacements of remaining Theia references.
2. Preserve `LICENSE-THEIA` and all required upstream notices.
3. Run the most relevant build, lint, and test commands for the files changed.
4. Describe any manual testing still needed, especially for Electron-only behavior.

AI coding agents should read [`AGENTS.md`](AGENTS.md) before making changes. It contains repository-specific scope, validation, and documentation rules.

## Security and privacy

Connectome is a local desktop application, but embedded websites, installed plugins, terminals, and external command-line tools may access networks or local files according to their own permissions and configuration. Review third-party plugins and tools before using them with sensitive workspaces.

Please do not publish credentials, private notes, or sensitive logs in issue reports.

## License and attribution

Connectome is licensed under the [MIT License](LICENSE).

This project is derived from Eclipse Theia and includes or depends on upstream work under its own license terms. See [LICENSE-THEIA](LICENSE-THEIA) for Eclipse Theia's license and attribution. Third-party packages and bundled plugins remain subject to their respective licenses.

## Author

**James Grimm**<br>
[GitHub: @jg-c-elegans](https://github.com/jg-c-elegans)<br>
Elegans Labs<br>
[contact@jgrimm.dev](mailto:contact@jgrimm.dev)
