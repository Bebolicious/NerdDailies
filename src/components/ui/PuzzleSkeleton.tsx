import { cn } from '../../lib/cn'

type Variant = 'screenshot' | 'trophy' | 'blur' | 'soundtrack'

function Block({ className }: { className?: string }) {
  return <div className={cn('shimmer', className)} />
}

function SlotsRow() {
  return (
    <div className="flex items-center gap-3">
      <Block className="h-3 w-20" />
      <div className="flex items-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-8 border-neo-2 shimmer" />
        ))}
      </div>
    </div>
  )
}

function ScreenshotSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:flex-1 md:min-h-0">
      <div className="flex flex-col md:flex-row gap-4 md:flex-1 md:min-h-0">
        <div className="border-neo shadow-neo md:flex-1 md:min-h-0 min-w-0 min-h-[260px] shimmer" />
        <div className="md:w-[300px] shrink-0 flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-neo-2 h-20 shimmer" />
          ))}
        </div>
      </div>
      <div className="border-neo h-12 shimmer" />
      <SlotsRow />
    </div>
  )
}

function TrophySkeleton() {
  return (
    <div className="max-w-3xl flex flex-col gap-5">
      <div className="border-neo shadow-neo bg-emphasis p-6">
        <div className="flex items-start gap-5">
          <div className="w-20 h-20 border-neo-2 shimmer shrink-0" />
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <Block className="h-3 w-40" />
            <Block className="h-6 w-3/4" />
            <Block className="h-3 w-full" />
            <Block className="h-3 w-2/3" />
          </div>
        </div>
      </div>
      <div className="border-neo h-12 shimmer" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-neo-2 h-10 shimmer" />
        ))}
      </div>
      <SlotsRow />
    </div>
  )
}

function BlurSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:flex-1 md:min-h-0">
      <div className="flex flex-col md:flex-row gap-4 md:flex-1 md:min-h-0">
        <div className="md:flex-1 md:min-h-0 min-w-0 flex md:items-center md:justify-center md:py-2">
          <div className="border-neo shadow-neo aspect-[3/4] w-full max-w-[360px] mx-auto md:h-full md:w-auto md:max-w-[450px] md:max-h-[600px] md:mx-0 shimmer" />
        </div>
        <div className="md:w-[300px] shrink-0 flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-neo-2 h-20 shimmer" />
          ))}
        </div>
      </div>
      <div className="border-neo h-12 shimmer" />
      <SlotsRow />
    </div>
  )
}

function SoundtrackSkeleton() {
  return (
    <div className="max-w-3xl flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Block className="h-5 w-32" />
        <div className="h-7 w-7 border-neo-2 shimmer" />
      </div>
      <div className="border-neo shadow-neo bg-emphasis p-5 flex items-center gap-4">
        <div className="h-12 w-12 border-neo-2 shimmer shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <Block className="h-3 w-24" />
          <Block className="h-6 w-full" />
        </div>
      </div>
      <div className="border-neo h-12 shimmer" />
      <SlotsRow />
    </div>
  )
}

export function PuzzleSkeleton({ variant }: { variant: Variant }) {
  switch (variant) {
    case 'screenshot':
      return <ScreenshotSkeleton />
    case 'trophy':
      return <TrophySkeleton />
    case 'blur':
      return <BlurSkeleton />
    case 'soundtrack':
      return <SoundtrackSkeleton />
  }
}
