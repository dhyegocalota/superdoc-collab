import { TrackedChangeKind } from '../seed-docx';

export enum ShowcaseAuthor {
  Ana = 'Ana Lima',
  Bruno = 'Bruno Costa',
  Caio = 'Caio Souza',
  Dani = 'Dani Alves',
}

export type ShowcaseEdit = { paragraph: number; kind: TrackedChangeKind; text: string };

export type ShowcaseBurst = { day: number; hour: number; minute: number; author: ShowcaseAuthor; edits: ShowcaseEdit[] };

function insert({ paragraph, text }: { paragraph: number; text: string }): ShowcaseEdit {
  return { paragraph, kind: TrackedChangeKind.Insert, text };
}

function remove({ paragraph, text }: { paragraph: number; text: string }): ShowcaseEdit {
  return { paragraph, kind: TrackedChangeKind.Delete, text };
}

export const SHOWCASE_BURSTS: ShowcaseBurst[] = [
  {
    day: 0,
    hour: 9,
    minute: 10,
    author: ShowcaseAuthor.Ana,
    edits: [
      insert({ paragraph: 2, text: ' It also keeps the person behind every change visible.' }),
      insert({ paragraph: 3, text: ' Volume is read from the size of each change, not from the number of saves.' }),
      insert({ paragraph: 5, text: ' The brief values thoughtful, user-centric design over speed.' }),
    ],
  },
  {
    day: 0,
    hour: 11,
    minute: 40,
    author: ShowcaseAuthor.Bruno,
    edits: [
      insert({ paragraph: 10, text: " The demo is tested against the team's own sample documents." }),
      insert({ paragraph: 11, text: ' The interface must feel designed, not generated.' }),
      insert({ paragraph: 12, text: ' Tracked changes stay readable while they are reviewed.' }),
    ],
  },
  {
    day: 0,
    hour: 14,
    minute: 25,
    author: ShowcaseAuthor.Caio,
    edits: [
      insert({ paragraph: 7, text: ' Columns of colour mark who contributed in each period.' }),
      insert({ paragraph: 8, text: ' Wiggle and symmetry choices change how calm the chart looks.' }),
      remove({ paragraph: 8, text: ' Symmetric layouts hide the baseline.' }),
    ],
  },
  {
    day: 0,
    hour: 17,
    minute: 5,
    author: ShowcaseAuthor.Dani,
    edits: [
      insert({ paragraph: 17, text: ' Cursors and names show where everyone is typing.' }),
      insert({ paragraph: 18, text: ' The server records each change as a small update.' }),
      remove({ paragraph: 19, text: ' Imported revisions are ignored.' }),
    ],
  },
  {
    day: 1,
    hour: 9,
    minute: 30,
    author: ShowcaseAuthor.Bruno,
    edits: [
      insert({ paragraph: 13, text: ' Larger files are rejected with a clear message.' }),
      insert({ paragraph: 14, text: ' A single command starts the whole stack.' }),
      insert({ paragraph: 15, text: ' Document text goes only to the language model provider.' }),
    ],
  },
  {
    day: 1,
    hour: 12,
    minute: 15,
    author: ShowcaseAuthor.Ana,
    edits: [
      insert({ paragraph: 4, text: ' Each filter narrows the chart and the lists together.' }),
      remove({ paragraph: 5, text: ' Bring your own ideas.' }),
      insert({ paragraph: 2, text: ' Contributors see the same history, ordered by time.' }),
    ],
  },
  {
    day: 1,
    hour: 15,
    minute: 50,
    author: ShowcaseAuthor.Dani,
    edits: [
      insert({ paragraph: 19, text: ' Their dates place them on the same timeline as live edits.' }),
      insert({ paragraph: 18, text: ' Authors keep a colour for as long as they belong to the document.' }),
      remove({ paragraph: 17, text: ' Presence is shown with avatars only.' }),
    ],
  },
  {
    day: 2,
    hour: 8,
    minute: 55,
    author: ShowcaseAuthor.Caio,
    edits: [
      insert({ paragraph: 21, text: ' Bins grow from seconds to days as the span grows.' }),
      insert({ paragraph: 21, text: ' Each band is a topic named by a language model.' }),
      insert({ paragraph: 22, text: ' A line marks the selected moment on the chart.' }),
    ],
  },
  {
    day: 2,
    hour: 10,
    minute: 45,
    author: ShowcaseAuthor.Dani,
    edits: [
      insert({ paragraph: 22, text: ' Summaries mention the topic, the people and the size of the change.' }),
      remove({ paragraph: 22, text: ' Pick a point to read the text.' }),
      insert({ paragraph: 17, text: " Joining and leaving never interrupt anyone's typing." }),
    ],
  },
  {
    day: 2,
    hour: 13,
    minute: 30,
    author: ShowcaseAuthor.Bruno,
    edits: [
      insert({ paragraph: 10, text: ' A deployed URL is shared with the team.' }),
      remove({ paragraph: 11, text: ' Any framework works.' }),
      insert({ paragraph: 13, text: ' Ten megabytes is the largest upload accepted.' }),
    ],
  },
  {
    day: 2,
    hour: 16,
    minute: 20,
    author: ShowcaseAuthor.Ana,
    edits: [
      insert({ paragraph: 3, text: ' Names and dates are always shown beside the numbers.' }),
      insert({ paragraph: 4, text: ' Filters are remembered while the page is open.' }),
      insert({ paragraph: 1, text: ' of the project' }),
    ],
  },
  {
    day: 3,
    hour: 9,
    minute: 20,
    author: ShowcaseAuthor.Dani,
    edits: [
      insert({ paragraph: 18, text: ' A version can be saved at any time and reopened later.' }),
      insert({ paragraph: 18, text: ' Agents that edit are listed as their own contributors.' }),
      remove({ paragraph: 19, text: ' Unreadable dates are skipped.' }),
    ],
  },
  {
    day: 3,
    hour: 11,
    minute: 10,
    author: ShowcaseAuthor.Caio,
    edits: [
      insert({ paragraph: 8, text: ' Hovering a band names the topic and its share of edits.' }),
      insert({ paragraph: 21, text: ' A dashed divider marks time with no edits at all.' }),
      remove({ paragraph: 7, text: ' Pages are compared two at a time.' }),
    ],
  },
  {
    day: 3,
    hour: 14,
    minute: 40,
    author: ShowcaseAuthor.Ana,
    edits: [
      insert({ paragraph: 24, text: ' A short explanation of each cut keeps the scope clear.' }),
      insert({ paragraph: 23, text: ' for this version' }),
      remove({ paragraph: 24, text: ' Images are welcome.' }),
    ],
  },
  {
    day: 4,
    hour: 9,
    minute: 0,
    author: ShowcaseAuthor.Bruno,
    edits: [
      insert({ paragraph: 12, text: ' The editor loads the stored file when a room is created.' }),
      insert({ paragraph: 14, text: ' The image builds from the repository without extra steps.' }),
      insert({ paragraph: 15, text: ' No other company receives a copy of the document.' }),
    ],
  },
  {
    day: 4,
    hour: 11,
    minute: 35,
    author: ShowcaseAuthor.Ana,
    edits: [
      insert({ paragraph: 0, text: ' (read me first)' }),
      insert({ paragraph: 2, text: ' Open the timeline to see the story of this very document.' }),
      remove({ paragraph: 4, text: ' and by time' }),
    ],
  },
  {
    day: 4,
    hour: 14,
    minute: 15,
    author: ShowcaseAuthor.Caio,
    edits: [
      insert({ paragraph: 21, text: ' Narrow screens show the chart above the document.' }),
      insert({ paragraph: 22, text: ' Keyboard arrows step through the bins one at a time.' }),
      insert({ paragraph: 8, text: ' Colours stay the same across every view.' }),
    ],
  },
  {
    day: 4,
    hour: 16,
    minute: 45,
    author: ShowcaseAuthor.Dani,
    edits: [
      insert({ paragraph: 17, text: ' Try typing here from a second browser window.' }),
      insert({ paragraph: 18, text: ' Each person shows up as a separate contributor.' }),
      insert({ paragraph: 19, text: ' Nothing is lost if the connection drops for a moment.' }),
    ],
  },
];
