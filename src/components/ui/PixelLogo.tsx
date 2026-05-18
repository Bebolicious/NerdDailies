export function PixelLogo({ size = 44 }: { size?: number }) {
  // 8x8 pixel mascot
  const grid = [
    '..XXXX..',
    '.XXXXXX.',
    'XX.XX.XX',
    'XXXXXXXX',
    'XX.XX.XX',
    'X.XXXX.X',
    'X.X..X.X',
    '..X..X..',
  ]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      className="border-neo-2 bg-coral"
    >
      {grid.map((row, y) =>
        row
          .split('')
          .map((c, x) =>
            c === 'X' ? (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width="1"
                height="1"
                fill="var(--color-ink)"
              />
            ) : null,
          ),
      )}
    </svg>
  )
}
