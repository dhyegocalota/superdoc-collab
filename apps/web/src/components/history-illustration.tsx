import { cn } from '@/lib/utils';

type Run = { width: number; fillClass: string };
type PlacedRun = Run & { x: number };

const VIEW_BOX = '0 0 360 260';
const PAGE = { x: 16, y: 16, width: 176, height: 228, radius: 12 };
const TEXT_LEFT = 32;
const TEXT_TOP = 44;
const ROW_SPACING = 24;
const RUN_HEIGHT = 7;
const RUN_GAP = 6;
const PLAIN_FILL_CLASS = 'fill-muted-foreground/30';
const AUTHOR_FILL_CLASSES = ['fill-author-1', 'fill-author-2', 'fill-author-3', 'fill-author-4'];
const STREAM_X = [216, 258, 300, 344];
const STREAM_BOUNDARIES = [
  [96, 74, 90, 66],
  [124, 108, 122, 104],
  [150, 142, 150, 136],
  [172, 170, 176, 164],
  [190, 196, 198, 190],
];
const STREAM_BASELINE_Y = 214;
const STREAM_OPACITY_CLASS = 'opacity-80';

function plain(width: number): Run {
  return { width, fillClass: PLAIN_FILL_CLASS };
}

function authored({ author, width }: { author: number; width: number }): Run {
  return { width, fillClass: AUTHOR_FILL_CLASSES[author]! };
}

const PAGE_ROWS: Run[][] = [
  [plain(60), authored({ author: 0, width: 36 }), plain(40)],
  [plain(44), authored({ author: 1, width: 52 }), plain(38)],
  [plain(96), authored({ author: 2, width: 40 })],
  [authored({ author: 3, width: 30 }), plain(64), plain(34)],
  [plain(72), authored({ author: 0, width: 58 })],
  [plain(48), authored({ author: 1, width: 40 }), plain(44)],
  [plain(100)],
  [authored({ author: 2, width: 56 }), plain(50)],
];

function placeRuns(row: Run[]): PlacedRun[] {
  return row.reduce<PlacedRun[]>((placed, run) => {
    const previous = placed.at(-1);
    const x = previous ? previous.x + previous.width + RUN_GAP : TEXT_LEFT;
    return [...placed, { ...run, x }];
  }, []);
}

function curveThrough({ xs, ys, start }: { xs: number[]; ys: number[]; start: 'M' | 'L' }): string {
  const segments = xs.slice(1).map((x, index) => {
    const middle = (xs[index]! + x) / 2;
    return `C ${middle} ${ys[index]} ${middle} ${ys[index + 1]} ${x} ${ys[index + 1]}`;
  });
  return [`${start} ${xs[0]} ${ys[0]}`, ...segments].join(' ');
}

function bandPath({ upper, lower }: { upper: number[]; lower: number[] }): string {
  const top = curveThrough({ xs: STREAM_X, ys: upper, start: 'M' });
  const bottom = curveThrough({ xs: [...STREAM_X].reverse(), ys: [...lower].reverse(), start: 'L' });
  return `${top} ${bottom} Z`;
}

const STREAM_BANDS = AUTHOR_FILL_CLASSES.map((fillClass, index) => ({
  fillClass,
  path: bandPath({ upper: STREAM_BOUNDARIES[index]!, lower: STREAM_BOUNDARIES[index + 1]! }),
}));

export function HistoryIllustration({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox={VIEW_BOX} fill="none" className={cn('h-auto w-full', className)}>
      <rect {...PAGE} rx={PAGE.radius} className="fill-card stroke-border" strokeWidth={1.5} />
      {PAGE_ROWS.map((row, rowIndex) =>
        placeRuns(row).map((run) => (
          <rect
            key={`${rowIndex}-${run.x}`}
            x={run.x}
            y={TEXT_TOP + rowIndex * ROW_SPACING}
            width={run.width}
            height={RUN_HEIGHT}
            rx={RUN_HEIGHT / 2}
            className={run.fillClass}
          />
        )),
      )}
      {STREAM_BANDS.map((band) => (
        <path key={band.fillClass} d={band.path} className={cn(band.fillClass, STREAM_OPACITY_CLASS)} />
      ))}
      <line
        x1={STREAM_X[0]}
        x2={STREAM_X.at(-1)}
        y1={STREAM_BASELINE_Y}
        y2={STREAM_BASELINE_Y}
        className="stroke-border"
        strokeWidth={1.5}
      />
    </svg>
  );
}
