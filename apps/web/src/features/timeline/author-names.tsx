import { ClientActor, type EventAuthor } from '@superdoc-collab/types';
import { Fragment } from 'react';
import { AgentMark } from './agent-mark';
import { authorOf } from './author-of';

const NAME_SEPARATOR = ', ';

export function AuthorNames({ authors, authorKeys }: { authors: Record<string, EventAuthor>; authorKeys: string[] }) {
  return authorKeys.map((authorKey, index) => {
    const author = authorOf({ authors, authorKey });
    return (
      <Fragment key={authorKey}>
        {index > 0 && NAME_SEPARATOR}
        {author.name}
        {author.actor === ClientActor.Agent && <AgentMark name={author.name} />}
      </Fragment>
    );
  });
}
