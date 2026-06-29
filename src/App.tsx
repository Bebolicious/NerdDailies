import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ShellLayout } from './components/layout/ShellLayout'

const ScreenshotGame = lazy(() =>
  import('./pages/ScreenshotGame').then((m) => ({ default: m.ScreenshotGame })),
)
const TrophyGame = lazy(() =>
  import('./pages/TrophyGame').then((m) => ({ default: m.TrophyGame })),
)
const SoundtrackGame = lazy(() =>
  import('./pages/SoundtrackGame').then((m) => ({ default: m.SoundtrackGame })),
)
const BlurGame = lazy(() =>
  import('./pages/BlurGame').then((m) => ({ default: m.BlurGame })),
)
const ArchiveGame = lazy(() =>
  import('./pages/ArchiveGame').then((m) => ({ default: m.ArchiveGame })),
)
const CrosswordGame = lazy(() =>
  import('./pages/CrosswordGame').then((m) => ({ default: m.CrosswordGame })),
)
const HigherLowerGame = lazy(() =>
  import('./pages/HigherLowerGame').then((m) => ({
    default: m.HigherLowerGame,
  })),
)
const ConnectionsGame = lazy(() =>
  import('./pages/ConnectionsGame').then((m) => ({
    default: m.ConnectionsGame,
  })),
)
const HowToPlay = lazy(() =>
  import('./pages/HowToPlay').then((m) => ({ default: m.HowToPlay })),
)
const Stats = lazy(() =>
  import('./pages/Stats').then((m) => ({ default: m.Stats })),
)
const Replay = lazy(() =>
  import('./pages/Replay').then((m) => ({ default: m.Replay })),
)
const AdminLogin = lazy(() =>
  import('./pages/admin/AdminLogin').then((m) => ({ default: m.AdminLogin })),
)
const AdminDashboard = lazy(() =>
  import('./pages/admin/AdminDashboard').then((m) => ({
    default: m.AdminDashboard,
  })),
)
const ScreenshotEditor = lazy(() =>
  import('./pages/admin/ScreenshotEditor').then((m) => ({
    default: m.ScreenshotEditor,
  })),
)
const TrophyEditor = lazy(() =>
  import('./pages/admin/TrophyEditor').then((m) => ({
    default: m.TrophyEditor,
  })),
)
const SoundtrackEditor = lazy(() =>
  import('./pages/admin/SoundtrackEditor').then((m) => ({
    default: m.SoundtrackEditor,
  })),
)
const BlurEditor = lazy(() =>
  import('./pages/admin/BlurEditor').then((m) => ({ default: m.BlurEditor })),
)
const ArchiveEditor = lazy(() =>
  import('./pages/admin/ArchiveEditor').then((m) => ({
    default: m.ArchiveEditor,
  })),
)
const CrosswordEditor = lazy(() =>
  import('./pages/admin/CrosswordEditor').then((m) => ({
    default: m.CrosswordEditor,
  })),
)
const HigherLowerEditor = lazy(() =>
  import('./pages/admin/HigherLowerEditor').then((m) => ({
    default: m.HigherLowerEditor,
  })),
)
const ConnectionsEditor = lazy(() =>
  import('./pages/admin/ConnectionsEditor').then((m) => ({
    default: m.ConnectionsEditor,
  })),
)

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/screenshot/:date" element={<ScreenshotEditor />} />
          <Route path="/admin/trophy/:date" element={<TrophyEditor />} />
          <Route path="/admin/soundtrack/:date" element={<SoundtrackEditor />} />
          <Route path="/admin/blur/:date" element={<BlurEditor />} />
          <Route path="/admin/archive/:date" element={<ArchiveEditor />} />
          <Route path="/admin/crossword/:date" element={<CrosswordEditor />} />
          <Route
            path="/admin/higherlower/:date"
            element={<HigherLowerEditor />}
          />
          <Route
            path="/admin/connections/:date"
            element={<ConnectionsEditor />}
          />

          <Route path="/" element={<Navigate to="/screenshot" replace />} />
          <Route
            path="/screenshot"
            element={
              <ShellLayout>
                <ScreenshotGame />
              </ShellLayout>
            }
          />
          <Route
            path="/trophy"
            element={
              <ShellLayout>
                <TrophyGame />
              </ShellLayout>
            }
          />
          <Route
            path="/soundtrack"
            element={
              <ShellLayout>
                <SoundtrackGame />
              </ShellLayout>
            }
          />
          <Route
            path="/blur"
            element={
              <ShellLayout>
                <BlurGame />
              </ShellLayout>
            }
          />
          <Route
            path="/archive"
            element={
              <ShellLayout>
                <ArchiveGame />
              </ShellLayout>
            }
          />
          <Route
            path="/crossword"
            element={
              <ShellLayout>
                <CrosswordGame />
              </ShellLayout>
            }
          />
          <Route
            path="/higherlower"
            element={
              <ShellLayout>
                <HigherLowerGame />
              </ShellLayout>
            }
          />
          <Route
            path="/connections"
            element={
              <ShellLayout>
                <ConnectionsGame />
              </ShellLayout>
            }
          />
          <Route
            path="/how-to-play"
            element={
              <ShellLayout>
                <HowToPlay />
              </ShellLayout>
            }
          />
          <Route
            path="/stats"
            element={
              <ShellLayout>
                <Stats />
              </ShellLayout>
            }
          />
          <Route
            path="/replay"
            element={
              <ShellLayout>
                <Replay />
              </ShellLayout>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
