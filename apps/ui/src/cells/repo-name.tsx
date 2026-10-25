import { shortRepoName } from '@/snapshot/selectors';

/** A repo by its name alone when every Tracked PR shares its org; the full name shows on hover. */
export function RepoName({ repo, org }: { repo: string; org: string | null }) {
  const name = shortRepoName(repo, org);
  return <span title={name === repo ? undefined : repo}>{name}</span>;
}
