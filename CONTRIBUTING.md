# Contributing to Clip Maker

Thank you for your interest in contributing to **Clip Maker**! We welcome contributions from developers, designers, and video editors of all backgrounds.

Please review this guide before getting started.

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior following our reporting guidelines.

---

## Development Setup

### Prerequisites

Make sure you have the following installed on your development machine:

1. **[Node.js](https://nodejs.org/)** (v18 or later) and **npm**
2. **[Rust](https://www.rust-lang.org/tools/install)** (stable toolchain, 2021 edition)
3. **[FFmpeg & FFprobe](https://ffmpeg.org/download.html)**:
   - Ensure `ffmpeg` and `ffprobe` are added to your system `PATH`, **OR**
   - Place `ffmpeg.exe` and `ffprobe.exe` into `src-tauri/binaries/` (ignored by git).
4. **C++ Build Tools** (on Windows: Visual Studio C++ build tools / MSVC).

### Step-by-Step Installation

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/gautamcoder235/Clip-Maker.git
   cd Clip-Maker
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Verify FFmpeg:**
   Run the following in your terminal to confirm FFmpeg is detected:
   ```bash
   ffmpeg -version
   ffprobe -version
   ```

4. **Launch the development application:**
   ```bash
   npm run tauri dev
   ```
   This will start the Vite dev server and open the Tauri desktop window with hot-reloading enabled.

---

## Building and Verification

Before submitting changes, ensure that both the frontend and backend compile without errors:

1. **Build frontend:**
   ```bash
   npm run build
   ```

2. **Check Rust backend:**
   ```bash
   cd src-tauri
   cargo check
   cargo test
   cd ..
   ```

3. **Test a production release build (optional):**
   ```bash
   npm run tauri build
   ```

---

## Branching & Commit Conventions

### Branch Naming
- Features: `feat/feature-name`
- Bug fixes: `fix/bug-name`
- Documentation: `docs/topic-name`
- Performance/Refactoring: `refactor/area-name`

### Commit Messages
We encourage [Conventional Commits](https://www.conventionalcommits.org/):
- `feat: add custom subtitle outline color`
- `fix: resolve live preview audio track desync`
- `docs: update FFmpeg installation guide`
- `perf: optimize GPU encoder detection caching`

---

## Submitting a Pull Request

1. Push your branch to your fork.
2. Open a Pull Request against the `main` branch.
3. Fill out the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) with details on:
   - What problem is addressed or feature added.
   - Any breaking changes or UI updates (include screenshots/recordings if applicable).
   - Confirmation that `npm run build` and `cargo check` pass.

---

## Reporting Issues

If you find a bug or have a suggestion, please check the [existing issues](https://github.com/gautamcoder235/Clip-Maker/issues) first. If it has not been reported yet:
- Use our [Bug Report Template](https://github.com/gautamcoder235/Clip-Maker/issues/new?template=bug_report.yml) with logs and reproduction steps.
- Use our [Feature Request Template](https://github.com/gautamcoder235/Clip-Maker/issues/new?template=feature_request.yml) for enhancements.
