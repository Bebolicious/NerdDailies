import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ShellLayout } from './components/layout/ShellLayout'
import { ScreenshotGame } from './pages/ScreenshotGame'
import { TrophyGame } from './pages/TrophyGame'
import { SoundtrackGame } from './pages/SoundtrackGame'
import { HowToPlay } from './pages/HowToPlay'
import { Stats } from './pages/Stats'
import { AdminLogin } from './pages/admin/AdminLogin'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { ScreenshotEditor } from './pages/admin/ScreenshotEditor'
import { TrophyEditor } from './pages/admin/TrophyEditor'
import { SoundtrackEditor } from './pages/admin/SoundtrackEditor'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/screenshot/:date" element={<ScreenshotEditor />} />
        <Route path="/admin/trophy/:date" element={<TrophyEditor />} />
        <Route path="/admin/soundtrack/:date" element={<SoundtrackEditor />} />

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
      </Routes>
    </BrowserRouter>
  )
}

export default App
