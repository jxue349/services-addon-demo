/**
 * Parent-spec followers: who gets asked to review a change to the knowledge
 * base.
 *
 * Kept as a plain file in the repo rather than CODEOWNERS because CODEOWNERS
 * can only name people with write access, and the people who care most about
 * subscription behavior are often PMs who should be consulted without being
 * able to push. Followers listed here are requested as PR reviewers, and
 * anyone GitHub refuses (no write access) is @-mentioned in the PR body
 * instead, which still notifies them.
 */

export const FOLLOWERS_FILENAME = 'followers.txt';

/** Where the followers file sits, alongside the parent spec. */
export function followersPathFor(parentPath: string): string {
  const dir = parentPath.includes('/') ? parentPath.slice(0, parentPath.lastIndexOf('/')) : '';
  return dir === '' ? FOLLOWERS_FILENAME : `${dir}/${FOLLOWERS_FILENAME}`;
}

const MAX_FOLLOWERS = 50;

/**
 * One GitHub username per line. `#` starts a comment, blank lines are
 * ignored, and a leading `@` is tolerated.
 */
export function parseFollowers(content: string): string[] {
  const seen = new Set<string>();

  for (const line of content.split('\n')) {
    const withoutComment = line.split('#')[0] ?? '';
    const name = withoutComment.trim().replace(/^@/, '');
    if (name === '') continue;

    // GitHub usernames: alphanumeric and single hyphens, max 39 chars.
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(name)) continue;

    seen.add(name);
    if (seen.size >= MAX_FOLLOWERS) break;
  }

  return [...seen];
}
