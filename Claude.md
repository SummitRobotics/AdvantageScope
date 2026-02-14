# AdvantageScope Development Guide

## Overview
AdvantageScope is an Electron-based TypeScript application for FRC robot telemetry and log analysis. It uses Three.js for 3D visualizations and Rollup for bundling.

## Prerequisites
- Node.js (LTS version recommended)
- Emscripten 4.0.12 (only required for `npm run wasm:compile`; not needed for general TypeScript development)
- Git

## Initial Setup

```bash
# Clone the repository
git clone https://github.com/Mechanical-Advantage/AdvantageScope.git
cd AdvantageScope

# Install dependencies (this will also run postinstall scripts)
npm install
```

The `postinstall` script automatically:
- Downloads Tesseract language support
- Downloads Owlet binaries
- Bundles assets for AdvantageScope Lite

## Development Workflow

### Running the Application

```bash
# Compile all bundles
npm run compile

# Compile WebAssembly (requires Emscripten — skip if not installed)
# npm run wasm:compile

# Start the application (works without wasm:compile for most development)
npm start
```

### Watch Mode (Development)

For faster development, use watch mode to automatically recompile on file changes:

```bash
# Watch all bundles
npm run watch

# Watch specific bundle (faster)
npm run watch -- --configLargeRenderers   # Main UI
npm run watch -- --configMain             # Main process
npm run watch -- --configSmallRenderers   # Pop-up windows
npm run watch -- --configWorkers          # Web workers
npm run watch -- --configXR               # XR client
```

### Building

```bash
# Full production build
npm run build

# Quick build (unpacked, for testing)
npm run fast-build

# Linux-specific build
npm run build-linux
```

### Code Formatting

```bash
# Check formatting
npm run check-format

# Auto-fix formatting and add license headers
npm run format
```

## Distribution Modes

Set `ASCOPE_DISTRIBUTION` before building:

```bash
# FRC 6328 (default)
export ASCOPE_DISTRIBUTION=FRC6328

# WPILib distribution
export ASCOPE_DISTRIBUTION=WPILIB

# Lite (web) distribution
export ASCOPE_DISTRIBUTION=LITE
```

## Project Structure

### Source Layout
- `src/` - TypeScript source code
  - `shared/` - Shared code between processes
    - `renderers/` - Tab renderers (visualizers)
      - `Field3dRenderer.ts` - 3D field visualizer interface
      - `Field3dRendererImpl.ts` - 3D field visualizer implementation
      - `field3d/` - 3D field renderer internals
        - `ObjectManager.ts` - Base class for 3D object managers
        - `objectManagers/` - Specific object type managers
          - `TrajectoryManager.ts` - Line strip visualizer
          - `RobotManager.ts` - Robot model visualizer
          - `AprilTagManager.ts` - AprilTag visualizer
          - etc.
- `bundles/` - Compiled JavaScript output
- `www/` - Static web assets
- `docs/` - Documentation (Docusaurus)

### Build Configuration
- `rollup.config.mjs` - Rollup bundler configuration
- `package.json` - NPM scripts and dependencies
- `tsconfig.json` - TypeScript configuration

## 3D Visualizer Architecture

### How 3D Visualizers Work

1. **Command Structure** ([Field3dRenderer.ts:120-208](src/shared/renderers/Field3dRenderer.ts#L120-L208))
   - `Field3dRendererCommand` defines the render command structure
   - `Field3dRendererCommand_AnyObj` is a union of all object types
   - Each object type has fields like `type`, `poses`, `color`, etc.

2. **Object Managers** ([Field3dRendererImpl.ts:108-112](src/shared/renderers/Field3dRendererImpl.ts#L108-L112))
   - Each object type has a corresponding manager class
   - Managers extend `ObjectManager<ObjectType>` base class
   - Managers handle Three.js scene management for their object type

3. **Manager Lifecycle**
   - Created on-demand in `createObjectManager()` ([Field3dRendererImpl.ts:437-484](src/shared/renderers/Field3dRendererImpl.ts#L437-L484))
   - Activated/deactivated based on command objects
   - Disposed when no longer needed

4. **Rendering Loop** ([Field3dRendererImpl.ts:784-813](src/shared/renderers/Field3dRendererImpl.ts#L784-L813))
   - Mark all managers inactive
   - For each object in command:
     - Find/create matching manager
     - Call `setObjectData()` on manager
   - Dispose inactive managers

### Example: TrajectoryManager

The `TrajectoryManager` ([TrajectoryManager.ts](src/shared/renderers/field3d/objectManagers/TrajectoryManager.ts)) renders line strips:
- Uses Three.js `Line2` with `LineGeometry` and `LineMaterial`
- Accepts array of poses
- Connects poses into a continuous line (line strip)

### Example: LineListManager

The `LineListManager` ([LineListManager.ts](src/shared/renderers/field3d/objectManagers/LineListManager.ts)) renders disconnected line segments:
- Uses Three.js `Line2` with `LineGeometry` and `LineMaterial`
- Accepts array of poses where each pair represents one line segment
- Interprets poses as: [p0, p1], [p2, p3], [p4, p5], etc.
- Useful for visualizing debug data like line-of-sight checks, sensor rays, etc.

## Adding a New Visualizer

To add a new 3D visualizer, follow these steps (as demonstrated with the line list visualizer):

1. **Define command type** in [Field3dRenderer.ts](src/shared/renderers/Field3dRenderer.ts)
   - Add type definition (e.g., `Field3dRendererCommand_LineListObj`)
   - Add to `Field3dRendererCommand_AnyObj` union

2. **Create manager class** in `src/shared/renderers/field3d/objectManagers/`
   - Extend `ObjectManager<YourCommandType>`
   - Implement `dispose()`, `setObjectData()`, and optionally `setResolution()`
   - Handle Three.js scene management

3. **Register manager** in both renderer implementations:
   - [Field3dRendererImpl.ts](src/shared/renderers/Field3dRendererImpl.ts) `createObjectManager()`
   - [XRRenderer.ts](src/xrClient/XRRenderer.ts) `createObjectManager()`
   - Add imports for your new manager

4. **Add UI configuration** in [Field3dController_Config.ts](src/hub/controllers/Field3dController_Config.ts)
   - Define visualization options (color, size, etc.)
   - Specify supported data types
   - Add to types array

5. **Wire up data flow** in [Field3dController.ts](src/hub/controllers/Field3dController.ts)
   - Add case in render command builder
   - Map UI options to command object

## Performance Guidelines for Object Managers

### Avoid per-frame geometry disposal/recreation
Three.js `LineGeometry.dispose()` + `new LineGeometry()` every frame causes GPU buffer churn and memory fragmentation. Instead, reuse geometry by calling `setPositions()` and setting `needsUpdate = true` on the position attribute. Only dispose/recreate when the vertex count actually changes.

**Good** (TrajectoryManager pattern):
```typescript
if (object.poses.length !== this.length) {
    this.line.geometry.dispose();
    this.line.geometry = new LineGeometry();
    this.length = object.poses.length;
}
this.line.geometry.setPositions(positionData);
this.line.geometry.attributes.position.needsUpdate = true;
```

**Bad** (dispose/recreate every frame):
```typescript
line.geometry.dispose();
line.geometry = new LineGeometry();
line.geometry.setPositions(positionData);
```

### Known issues to fix
- **LineListManager.ts lines 104-106**: Disposes and recreates geometry every frame for every segment even though segment size (2 points) never changes. Should update positions in place.
- **TrajectoryManager.ts lines 54-57**: Recreates geometry whenever pose count changes. For physics sims publishing variable-length trajectories each cycle, this causes per-frame churn. Consider over-allocating or using `needsUpdate` patterns.

## Notes

- Always run `npm run format` before committing
- Backward compatibility is critical - don't break existing log formats
- Most features should work in both desktop and web (Lite) versions
- See [CONTRIBUTING.md](CONTRIBUTING.md) for full contribution guidelines
